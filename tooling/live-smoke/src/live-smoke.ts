/**
 * Daily live smoke test — "adapter survival" lifeline
 * (specs/monorepo-architecture.md §11, docs/implementation-checklist.md).
 *
 * Drives real chatgpt.com / claude.ai / gemini.google.com with Playwright and
 * verifies the selectors published by @gotomemory/site-adapters still match:
 *   - inputSelector must match a visible element (the composer),
 *   - mountSelector must exist (panel mount point).
 *
 * Run with `pnpm --filter @gotomemory/live-smoke run smoke:live`. Requires
 * `playwright install chromium` beforehand; NOT part of the default turbo
 * `test` task (unit tests for the classification live in index.test.ts).
 *
 * Env:
 *   GOTOMEMORY_SMOKE_STORAGE_STATE_<CHATGPT|CLAUDE|GEMINI>
 *       optional path to a Playwright storageState JSON for a logged-in
 *       session. Without it, login-gated sites report "login-blocked" and
 *       anti-bot interstitials report "bot-blocked".
 *   GOTOMEMORY_SMOKE_CONVERSATION_URL_<CHATGPT|CLAUDE|GEMINI>
 *       optional URL of a real (non-empty) conversation. When set, the run
 *       also opens it and verifies messageSelector — the most breakage-prone
 *       selector, which the anonymous homepage can never exercise.
 *   GOTOMEMORY_SMOKE_STRICT=1
 *       treat login-blocked / bot-blocked / unreachable as failures too
 *       (default: warn).
 *   GOTOMEMORY_SMOKE_REPORT
 *       JSON report path (default: ./live-smoke-report.json).
 *   GOTOMEMORY_SMOKE_STATE / GOTOMEMORY_SMOKE_BLIND_THRESHOLD
 *       streak-state file (default ./live-smoke-streak.json, cached across CI
 *       runs) and the number of consecutive blind runs (bot/login-blocked or
 *       unreachable) after which the run fails loudly (default 3) — a
 *       permanently blind lifeline must not stay a silent warning.
 *
 * Exit code: 1 if any selector fails on a reachable page (message names the
 * platform and the selector) or a platform crossed the blindness threshold,
 * otherwise 0.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { adapters, type SiteAdapter } from "@gotomemory/site-adapters";
import { chromium, type Page } from "playwright";

import {
  classifyProbe,
  describeOutcome,
  isFatal,
  type ProbeResult,
  type SmokeOutcome
} from "./index.js";
import { blindAlerts, parseStreakState, updateStreaks } from "./streak.js";

const NAVIGATION_TIMEOUT_MS = 45_000;
/** SPAs render the composer well after domcontentloaded; poll up to this long. */
const SETTLE_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

/** Off-adapter hosts that unambiguously mean "sent away to authenticate". */
const AUTH_HOSTS = ["accounts.google.com", "auth.openai.com", "auth0.openai.com", "login.live.com"];

interface PlatformResult {
  platform: string;
  host: string;
  url: string;
  authenticated: boolean;
  conversationUrl: string | null;
  probe: ProbeResult;
  outcome: SmokeOutcome;
}

function conversationUrlFor(platform: string): string | null {
  return process.env[`GOTOMEMORY_SMOKE_CONVERSATION_URL_${platform.toUpperCase()}`] ?? null;
}

function storageStatePath(platform: string): string | undefined {
  const value = process.env[`GOTOMEMORY_SMOKE_STORAGE_STATE_${platform.toUpperCase()}`];
  if (!value) {
    return undefined;
  }
  const resolved = path.resolve(value);
  if (!existsSync(resolved)) {
    console.warn(`warning: storage state for ${platform} not found at ${resolved}; ignoring`);
    return undefined;
  }
  return resolved;
}

function urlLooksLikeLogin(rawUrl: string, adapterHost: string): boolean {
  try {
    const { host, pathname } = new URL(rawUrl);
    if (AUTH_HOSTS.some((auth) => host === auth || host.endsWith(`.${auth}`))) {
      return true;
    }
    // Redirected clean off the product host (SSO, consent screens, ...).
    if (host !== adapterHost && !host.endsWith(`.${adapterHost}`)) {
      return true;
    }
    return /(^|\/)(login|log-in|signin|sign-in|auth)(\/|$)/i.test(pathname);
  } catch {
    return false;
  }
}

async function snapshotPage(page: Page, adapter: SiteAdapter): Promise<ProbeResult> {
  // Same visibility rule the adapters use at runtime (offsetParent/client rects).
  const composerVisible = await page
    .$$eval(adapter.inputSelector, (elements) =>
      elements.some(
        (element) =>
          element instanceof HTMLElement &&
          (element.offsetParent !== null || element.getClientRects().length > 0)
      )
    )
    .catch(() => false);

  const mountFound = await page
    .locator(adapter.mountSelector)
    .count()
    .then((count) => count > 0)
    .catch(() => false);

  // Cloudflare-style interstitials: chatgpt.com and claude.ai serve
  // "Just a moment..." to anonymous headless browsers (observed live). Treat
  // them as bot-blocked, not selector breakage.
  const botWallDetected = await page
    .evaluate(() => {
      if (/just a moment|attention required|verify you are human/i.test(document.title)) {
        return true;
      }
      if (
        /performing security verification|security service to protect/i.test(
          document.body?.innerText ?? ""
        )
      ) {
        return true;
      }
      return Boolean(
        document.querySelector(
          '#challenge-form, #challenge-running, script[src*="challenges.cloudflare.com"], iframe[src*="challenges.cloudflare.com"]'
        )
      );
    })
    .catch(() => false);

  const domLoginWall = await page
    .evaluate(() => {
      if (
        document.querySelector(
          'input[type="password"], form[action*="login" i], form[action*="signin" i]'
        )
      ) {
        return true;
      }
      const clickable = Array.from(document.querySelectorAll("a, button"));
      return clickable.some((element) => {
        const text = (element.textContent ?? "").trim().toLowerCase();
        return text.length < 40 && /\b(log ?in|sign ?in|sign ?up|continue with)\b/.test(text);
      });
    })
    .catch(() => false);

  return {
    composerVisible,
    mountFound,
    loginWallDetected: domLoginWall || urlLooksLikeLogin(page.url(), adapter.host),
    botWallDetected,
    navigationError: null
  };
}

/**
 * Open a real conversation and judge messageSelector. Returns:
 *   true  — matched at least one element with text (selector alive),
 *   false — page rendered without walls but the selector matched nothing,
 *   null  — could not judge (navigation failed, or the page itself is walled).
 */
async function probeConversationMessages(
  page: Page,
  adapter: SiteAdapter,
  conversationUrl: string
): Promise<boolean | null> {
  try {
    await page.goto(conversationUrl, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS
    });
  } catch {
    return null;
  }

  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let walled = false;
  for (;;) {
    const found = await page
      .$$eval(adapter.messageSelector, (elements) =>
        elements.some((element) => (element.textContent ?? "").trim().length > 0)
      )
      .catch(() => false);
    if (found) {
      return true;
    }
    const snapshot = await snapshotPage(page, adapter);
    walled = Boolean(snapshot.botWallDetected) || snapshot.loginWallDetected;
    if (Date.now() >= deadline) {
      return walled ? null : false;
    }
    await page.waitForTimeout(POLL_INTERVAL_MS);
  }
}

async function probePlatform(adapter: SiteAdapter): Promise<{
  probe: ProbeResult;
  url: string;
  authenticated: boolean;
  conversationUrl: string | null;
}> {
  const storageState = storageStatePath(adapter.platform);
  const conversationUrl = conversationUrlFor(adapter.platform);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext(storageState ? { storageState } : {});
    const page = await context.newPage();
    const target = `https://${adapter.host}/`;

    try {
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    } catch (error) {
      return {
        probe: {
          composerVisible: false,
          mountFound: false,
          loginWallDetected: false,
          botWallDetected: false,
          navigationError: error instanceof Error ? error.message : String(error)
        },
        url: target,
        authenticated: Boolean(storageState),
        conversationUrl
      };
    }

    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    let probe = await snapshotPage(page, adapter);
    while (!(probe.composerVisible && probe.mountFound) && Date.now() < deadline) {
      await page.waitForTimeout(POLL_INTERVAL_MS);
      probe = await snapshotPage(page, adapter);
    }

    if (conversationUrl) {
      probe = {
        ...probe,
        messagesFound: await probeConversationMessages(page, adapter, conversationUrl)
      };
    }
    return { probe, url: page.url(), authenticated: Boolean(storageState), conversationUrl };
  } finally {
    await browser.close();
  }
}

function printTable(results: PlatformResult[]): void {
  const rows = [
    ["platform", "status", "composer", "mount", "messages", "auth", "detail"],
    ...results.map((result) => [
      result.platform,
      result.outcome.status,
      result.probe.composerVisible ? "visible" : "missing",
      result.probe.mountFound ? "found" : "missing",
      result.probe.messagesFound === true
        ? "found"
        : result.probe.messagesFound === false
          ? "missing"
          : "not-probed",
      result.authenticated ? "storage-state" : "anonymous",
      describeOutcome(result.platform, result.outcome).replace(`${result.platform}: `, "")
    ])
  ];
  const widths = rows[0]!.map((_, column) =>
    Math.max(...rows.map((row) => (row[column] ?? "").length))
  );
  for (const [index, row] of rows.entries()) {
    console.log(row.map((cell, column) => (cell ?? "").padEnd(widths[column] ?? 0)).join("  "));
    if (index === 0) {
      console.log(widths.map((width) => "-".repeat(width)).join("  "));
    }
  }
}

async function main(): Promise<void> {
  const strict = process.env.GOTOMEMORY_SMOKE_STRICT === "1";
  const reportPath = path.resolve(process.env.GOTOMEMORY_SMOKE_REPORT ?? "live-smoke-report.json");

  const results: PlatformResult[] = [];
  for (const adapter of Object.values(adapters)) {
    console.log(`probing ${adapter.platform} (https://${adapter.host}/) ...`);
    const { probe, url, authenticated, conversationUrl } = await probePlatform(adapter);
    const outcome = classifyProbe(adapter, probe);
    results.push({
      platform: adapter.platform,
      host: adapter.host,
      url,
      authenticated,
      conversationUrl,
      probe,
      outcome
    });
  }

  console.log("");
  printTable(results);
  console.log("");

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), strict, results }, null, 2)}\n`
  );
  console.log(`report written to ${reportPath}`);

  // Blindness streaks: a platform that is bot/login-blocked run after run means
  // the lifeline has stopped seeing that site — escalate to a hard failure once
  // it crosses the threshold, even in non-strict mode.
  const statePath = path.resolve(process.env.GOTOMEMORY_SMOKE_STATE ?? "live-smoke-streak.json");
  const blindThreshold = Number.parseInt(process.env.GOTOMEMORY_SMOKE_BLIND_THRESHOLD ?? "3", 10);
  const previous = parseStreakState(await readFile(statePath, "utf8").catch(() => ""));
  const streaks = updateStreaks(
    previous,
    results.map((result) => ({ platform: result.platform, status: result.outcome.status }))
  );
  await writeFile(statePath, `${JSON.stringify(streaks, null, 2)}\n`);
  const alerts = blindAlerts(streaks, blindThreshold);

  const fatal = results.filter((result) => isFatal(result.outcome, strict));
  const warnings = results.filter(
    (result) => result.outcome.status !== "pass" && !isFatal(result.outcome, strict)
  );
  for (const warning of warnings) {
    console.warn(`warning: ${describeOutcome(warning.platform, warning.outcome)}`);
  }
  for (const alert of alerts) {
    console.error(`ALERT ${alert}`);
  }
  if (fatal.length > 0 || alerts.length > 0) {
    for (const failure of fatal) {
      console.error(`FAIL ${describeOutcome(failure.platform, failure.outcome)} (${failure.url})`);
    }
    process.exitCode = 1;
    return;
  }
  console.log("live smoke passed");
}

main().catch((error) => {
  console.error("live smoke crashed:", error);
  process.exitCode = 1;
});

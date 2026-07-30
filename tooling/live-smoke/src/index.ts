/**
 * Pure outcome classification for the daily live smoke test
 * (specs/monorepo-architecture.md §11 "线上冒烟（适配器生命线）").
 *
 * The Playwright runner (src/live-smoke.ts) probes each real site and feeds
 * the raw observations into `classifyProbe`. Keeping this logic pure lets the
 * decision table run under plain vitest with no browser installed.
 */

/** The selector subset of a SiteAdapter that the smoke test exercises. */
export interface SelectorSet {
  inputSelector: string;
  mountSelector: string;
  /** Probed only when a real conversation URL is configured for the platform. */
  messageSelector?: string;
}

/** Raw observations collected from a live page by the Playwright runner. */
export interface ProbeResult {
  /** inputSelector matched at least one *visible* element. */
  composerVisible: boolean;
  /** mountSelector matched at least one element. */
  mountFound: boolean;
  /** Login/signin wall heuristics fired (auth redirect, password form, login CTA). */
  loginWallDetected: boolean;
  /** Anti-bot interstitial detected (Cloudflare "Just a moment...", captcha, ...). */
  botWallDetected?: boolean;
  /** Navigation never produced a page to probe (network error, timeout, ...). */
  navigationError?: string | null;
  /**
   * messageSelector matched ≥1 element with text on a real conversation page —
   * the most breakage-prone selector, judgeable only with an authenticated
   * conversation URL. null/undefined = not probed (no URL configured, or the
   * conversation page itself was walled), which must never count as a failure.
   */
  messagesFound?: boolean | null;
}

export interface SelectorFailure {
  name: keyof SelectorSet;
  selector: string;
}

export type SmokeOutcome =
  | { status: "pass" }
  | { status: "selector-failure"; failures: SelectorFailure[] }
  | { status: "login-blocked" }
  | { status: "bot-blocked" }
  | { status: "unreachable"; reason: string };

/**
 * Classify one platform's probe.
 *
 * - Both selectors matched → pass, regardless of login/bot heuristics (a
 *   visible composer means we are on the real app, so a stray "Log in" link
 *   is noise).
 * - No visible composer behind an anti-bot interstitial → bot-blocked, and
 *   behind a login wall → login-blocked: in both cases the page is not the
 *   app, so the selectors were never given a fair chance.
 * - Anything else on a reachable page is a selector failure and names every
 *   selector that missed.
 */
export function classifyProbe(selectors: SelectorSet, probe: ProbeResult): SmokeOutcome {
  if (probe.navigationError) {
    return { status: "unreachable", reason: probe.navigationError };
  }
  if (probe.composerVisible && probe.mountFound && probe.messagesFound !== false) {
    return { status: "pass" };
  }
  if (!probe.composerVisible && probe.botWallDetected) {
    return { status: "bot-blocked" };
  }
  if (!probe.composerVisible && probe.loginWallDetected) {
    return { status: "login-blocked" };
  }

  const failures: SelectorFailure[] = [];
  if (!probe.composerVisible) {
    failures.push({ name: "inputSelector", selector: selectors.inputSelector });
  }
  if (!probe.mountFound) {
    failures.push({ name: "mountSelector", selector: selectors.mountSelector });
  }
  if (probe.messagesFound === false) {
    failures.push({ name: "messageSelector", selector: selectors.messageSelector ?? "" });
  }
  return { status: "selector-failure", failures };
}

/**
 * Exit-code policy: selector failures always fail the run; login-blocked,
 * bot-blocked and unreachable are warnings unless strict mode
 * (GOTOMEMORY_SMOKE_STRICT=1).
 */
export function isFatal(outcome: SmokeOutcome, strict: boolean): boolean {
  switch (outcome.status) {
    case "pass":
      return false;
    case "selector-failure":
      return true;
    case "login-blocked":
    case "bot-blocked":
    case "unreachable":
      return strict;
  }
}

/** One-line human summary, always naming platform + selector on failures. */
export function describeOutcome(platform: string, outcome: SmokeOutcome): string {
  switch (outcome.status) {
    case "pass":
      return `${platform}: pass`;
    case "selector-failure":
      return outcome.failures
        .map((failure) => `${platform}: ${failure.name} matched nothing — "${failure.selector}"`)
        .join("; ");
    case "login-blocked":
      return `${platform}: login-blocked (no storage state; selectors not judged)`;
    case "bot-blocked":
      return `${platform}: bot-blocked (anti-bot interstitial; selectors not judged)`;
    case "unreachable":
      return `${platform}: unreachable — ${outcome.reason}`;
  }
}

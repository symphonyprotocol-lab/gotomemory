/**
 * End-to-end proof that the built extension works in a real Chromium:
 * panel mounts → export downloads a fidelity-preserving file → save-all
 * persists through the background service worker → the memory injects into a
 * *different* conversation's composer via the execCommand path.
 *
 * Run with `pnpm --filter @gotomemory/extension-e2e run e2e` (builds the
 * extension and patches the E2E bundle first; requires Playwright Chromium:
 * `pnpm --filter @gotomemory/extension-e2e exec playwright install chromium`).
 */

import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";

import { routeFixture, SEED_CONVERSATION_PATH, TARGET_CONVERSATION_PATH } from "./fixtures";

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(here, "../../../apps/extension/.output/chrome-mv3-e2e");

test.describe.configure({ mode: "serial" });

/** Pinned browser UI language; the panel is expected to follow it. */
const BROWSER_LOCALE = "en-US";

let server: Server;
let baseUrl: string;
let context: BrowserContext;
let page: Page;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const html = routeFixture(request.url ?? "/");
    if (!html) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // MV3 extensions need a persistent context; `channel: "chromium"` enables
  // them under the new headless mode. The locale is pinned because the panel
  // follows the browser language — leaving it to the host machine would make
  // the assertions below pass or fail depending on who ran them.
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    locale: BROWSER_LOCALE,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      `--lang=${BROWSER_LOCALE}`
    ]
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
  await new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
});

test("panel mounts on a conversation page", async () => {
  await page.goto(`${baseUrl}${SEED_CONVERSATION_PATH}`);
  await expect(page.locator("[data-gotomemory-panel]")).toBeAttached();
  // Locators pierce the open shadow root: the four resting controls exist.
  await expect(page.locator('[data-gotomemory-action="export"]')).toBeVisible();
  await expect(page.locator('[data-gotomemory-action="save-all"]')).toBeVisible();
});

test("export downloads Markdown with code-block fidelity preserved", async () => {
  await page.locator("[data-gotomemory-format]").selectOption("markdown");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('[data-gotomemory-action="export"]').click()
  ]);

  expect(download.suggestedFilename()).toMatch(/\.md$/);
  const filePath = await download.path();
  const markdown = await readFile(filePath!, "utf8");
  // The DOM→Markdown serializer, running inside the real bundle, must emit a
  // real fence and drop the in-<pre> UI chrome.
  expect(markdown).toContain("```ts\nconst x: number = 1;\n```");
  expect(markdown).toContain("以后代码示例优先用 TypeScript");
  expect(markdown).not.toContain("Copy code");
});

test("save-all persists the conversation through the background worker", async () => {
  await page.locator('[data-gotomemory-action="save-all"]').click();
  await expect(page.locator(".gm-status")).toContainText("Saved 2 messages");
});

test("the saved memory injects into a different conversation's composer", async () => {
  await page.goto(`${baseUrl}${TARGET_CONVERSATION_PATH}`);
  await expect(page.locator("[data-gotomemory-panel]")).toBeAttached();

  await page.locator('[data-gotomemory-action="inject"]').click();
  await expect(page.locator(".gm-status")).toContainText("Injected");

  // execCommand("insertText") into the contenteditable composer — the code
  // path jsdom cannot exercise.
  const composer = page.locator("#prompt-textarea");
  await expect(composer).toContainText("memories the user has authorized");
  await expect(composer).toContainText("以后代码示例优先用 TypeScript");

  // Undo removes the exact injected block again.
  await page.locator("[data-gotomemory-undo]").click();
  await expect(composer).not.toContainText("以后代码示例优先用 TypeScript");
});

test("the panel follows the browser language and switches on demand", async () => {
  // Pinned to en-US above, so the panel opens in English.
  await expect(page.locator('[data-gotomemory-action="save-all"]')).toHaveText(
    "Save whole conversation"
  );

  await page.locator("[data-gotomemory-settings-toggle]").click();
  await page.locator("[data-gotomemory-locale]").selectOption("zh");

  await expect(page.locator('[data-gotomemory-action="save-all"]')).toHaveText("保存整段对话");
  await expect(page.locator("[data-gotomemory-drawer-title]")).toHaveText("记忆库");

  // The choice survives a reload of the content script (it is stored by the
  // background worker, not held in the panel).
  await page.reload();
  await expect(page.locator('[data-gotomemory-action="save-all"]')).toHaveText("保存整段对话");
});

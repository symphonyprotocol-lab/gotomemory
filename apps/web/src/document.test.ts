import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

describe("web document shell", () => {
  /**
   * Without a doctype the browser falls into quirks mode, where <html> sizes to
   * the whole document instead of the viewport. In-page anchors then update the
   * URL hash without scrolling anywhere, which made every nav link — including
   * "Install extension" — look completely dead.
   */
  it("declares a doctype, so the page is not rendered in quirks mode", () => {
    expect(html.trimStart().toLowerCase()).toMatch(/^<!doctype html>/);
  });

  it("keeps the mount point and entry script the app expects", () => {
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('src="/src/main.tsx"');
  });
});

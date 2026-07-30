import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PRIVACY_CONTACT_EMAIL, PrivacyPolicy, POLICY_UPDATED } from "./PrivacyPolicy.js";

const html = (locale: "zh" | "en"): string =>
  renderToStaticMarkup(<PrivacyPolicy locale={locale} />);

describe("privacy policy page", () => {
  it("discloses what the extension stores and where", () => {
    const page = html("zh");

    expect(page).toContain("隐私政策");
    expect(page).toContain("chrome.storage.local");
    expect(page).toContain(POLICY_UPDATED);
    expect(page).toContain(PRIVACY_CONTACT_EMAIL);
  });

  /**
   * The one outbound request the extension makes must be disclosed, including
   * the fact that the host sees an IP — a policy that claims "no network at
   * all" would be false, and store review compares the two.
   */
  it("discloses the selector-config request and its IP exposure", () => {
    for (const locale of ["zh", "en"] as const) {
      const page = html(locale);
      expect(page).toContain("config.gotomemory.dev");
      expect(page.toLowerCase()).toContain("ip");
    }
  });

  it("states that this version has no sync and no account", () => {
    expect(html("en")).toContain("no cloud sync");
    expect(html("zh")).toContain("不包含云同步");
  });

  it("renders fully in English, with no Chinese left behind", () => {
    expect(html("en")).not.toMatch(/[一-龥]/);
  });

  it("links back to the homepage, which links here", () => {
    expect(html("zh")).toContain('href="/"');
  });
});

describe("privacy policy entry point", () => {
  const shell = readFileSync(
    fileURLToPath(new URL("../privacy/index.html", import.meta.url)),
    "utf8"
  );

  /** Same quirks-mode trap as the homepage; see document.test.ts. */
  it("declares a doctype and mounts the policy entry", () => {
    expect(shell.trimStart().toLowerCase()).toMatch(/^<!doctype html>/);
    expect(shell).toContain('<div id="root"></div>');
    expect(shell).toContain('src="/src/privacy-main.tsx"');
  });
});

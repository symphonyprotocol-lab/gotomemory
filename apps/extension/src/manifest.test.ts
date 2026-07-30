import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { messages, type Locale } from "@gotomemory/i18n";
import { describe, expect, it } from "vitest";

import {
  defaultLocale,
  extensionVersion,
  hostPermissions,
  manifestDescription,
  manifestName,
  permissions
} from "./manifest.js";

describe("extension manifest", () => {
  /**
   * The Chrome Web Store rejects the upload outright if the version is
   * malformed, and rejects it again if the version does not increase — both
   * after you have filled in the whole listing form.
   */
  it("carries a version the Chrome Web Store will accept", () => {
    const parts = extensionVersion.split(".");
    expect(parts.length).toBeGreaterThanOrEqual(1);
    expect(parts.length).toBeLessThanOrEqual(4);
    for (const part of parts) {
      // Rejects leading zeros ("01"), prerelease tails ("0-beta"), and empties.
      expect(part).toMatch(/^\d+$/);
      expect(part).toBe(String(Number(part)));
      expect(Number(part)).toBeLessThanOrEqual(65535);
    }
    // 0.0.0 is the wxt placeholder, not a shippable version.
    expect(parts.some((part) => Number(part) > 0)).toBe(true);
  });

  it("uses exact AI assistant host permissions only", () => {
    expect(hostPermissions).toEqual([
      "https://chatgpt.com/*",
      "https://claude.ai/*",
      "https://gemini.google.com/*"
    ]);
  });

  it("requests unlimitedStorage so whole-conversation saves outlive the 10MB default", () => {
    expect(permissions).toContain("storage");
    expect(permissions).toContain("unlimitedStorage");
  });
});

describe("store listing localization", () => {
  const localeMessages = (folder: string): Record<string, { message: string }> =>
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL(`../public/_locales/${folder}/messages.json`, import.meta.url)),
        "utf8"
      )
    );

  it("localizes the manifest through __MSG__ placeholders", () => {
    expect(manifestName).toBe("__MSG_extName__");
    expect(manifestDescription).toBe("__MSG_extDescription__");
    // Chrome only resolves placeholders when a default_locale folder exists.
    expect(localeMessages(defaultLocale).extName?.message).toBeTruthy();
  });

  // The _locales files are what the browser reads; the dictionary is what the
  // UI reads. Drift between them means the store listing says something the
  // extension itself never says.
  it.each([
    ["en", "en"],
    ["zh_CN", "zh"],
    ["zh_TW", "zh"]
  ])("keeps %s in sync with the shared dictionary", (folder, locale) => {
    const file = localeMessages(folder);

    expect(file.extName?.message).toBe(messages[locale as Locale]["extension.name"]);
    expect(file.extDescription?.message).toBe(messages[locale as Locale]["extension.description"]);
  });
});

import { describe, expect, it } from "vitest";

import {
  createTranslator,
  detectBrowserLocale,
  detectLocale,
  en,
  isLocalePreference,
  localeTag,
  matchLocale,
  resolveLocale,
  translate,
  zh
} from "./index.js";

describe("locale detection", () => {
  it("follows the browser's first supported language", () => {
    expect(detectLocale(["zh-CN", "en-US"])).toBe("zh");
    expect(detectLocale(["en-GB", "zh-TW"])).toBe("en");
  });

  it("skips unsupported languages instead of settling on the first one", () => {
    expect(detectLocale(["fr-FR", "zh-Hant-HK"])).toBe("zh");
  });

  it("falls back to English for languages we do not ship", () => {
    expect(detectLocale(["fr-FR", "de-DE"])).toBe("en");
    expect(detectLocale([])).toBe("en");
    expect(detectLocale(undefined)).toBe("en");
  });

  it("treats every Chinese variant as Chinese", () => {
    for (const tag of ["zh", "zh-CN", "zh-TW", "zh-Hans", "ZH_HK"]) {
      expect(matchLocale(tag)).toBe("zh");
    }
  });

  it("prefers navigator.languages over navigator.language", () => {
    expect(detectBrowserLocale({ languages: ["zh-CN"], language: "en-US" })).toBe("zh");
    expect(detectBrowserLocale({ language: "zh-CN" })).toBe("zh");
    expect(detectBrowserLocale(null)).toBe("en");
  });

  it("keeps 'auto' dynamic and an explicit choice fixed", () => {
    expect(resolveLocale("auto", { languages: ["zh-CN"] })).toBe("zh");
    expect(resolveLocale("en", { languages: ["zh-CN"] })).toBe("en");
    expect(resolveLocale("zh", { languages: ["en-US"] })).toBe("zh");
  });

  it("validates stored preferences", () => {
    expect(isLocalePreference("auto")).toBe(true);
    expect(isLocalePreference("zh")).toBe(true);
    expect(isLocalePreference("fr")).toBe(false);
    expect(isLocalePreference(undefined)).toBe(false);
  });

  it("maps locales to BCP-47 tags for Intl and <html lang>", () => {
    expect(localeTag("zh")).toBe("zh-CN");
    expect(localeTag("en")).toBe("en-US");
  });
});

describe("dictionaries", () => {
  it("ships the same keys in both languages", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });

  it("has no empty strings", () => {
    for (const [key, value] of [...Object.entries(zh), ...Object.entries(en)]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("keeps the same placeholders in both languages", () => {
    // Compared as sets: an English plural form repeats "{count}" in each branch.
    const placeholders = (text: string): string[] =>
      [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
    for (const key of Object.keys(zh) as (keyof typeof zh)[]) {
      expect(placeholders(en[key]), key).toEqual(placeholders(zh[key]));
    }
  });

  it("only uses the plural separator on strings that take a count", () => {
    for (const [key, value] of Object.entries(en)) {
      if (value.includes("|")) {
        expect(value, key).toContain("{count}");
        expect(value.split("|"), key).toHaveLength(2);
      }
    }
  });
});

describe("translate", () => {
  it("returns the requested language", () => {
    expect(translate("zh", "panel.action.export")).toBe("导出");
    expect(translate("en", "panel.action.export")).toBe("Export");
  });

  it("fills placeholders", () => {
    expect(translate("zh", "panel.status.savedAll", { count: 3 })).toContain("3");
    expect(translate("en", "panel.status.exported", { filename: "chat.md" })).toBe(
      "✓ Exported chat.md"
    );
  });

  it("picks the English singular or plural wording from the count", () => {
    expect(translate("en", "panel.status.injected", { count: 1 })).toBe(
      "✓ Injected 1 relevant memory"
    );
    expect(translate("en", "panel.status.injected", { count: 3 })).toBe(
      "✓ Injected 3 relevant memories"
    );
    // Chinese does not inflect, so its strings carry no separator at all.
    expect(translate("zh", "panel.status.injected", { count: 1 })).toBe("✓ 已注入 1 条相关记忆");
  });

  it("leaves unknown placeholders untouched rather than printing 'undefined'", () => {
    expect(translate("en", "panel.status.exported", { other: "x" })).toContain("{filename}");
  });

  it("binds a locale once via createTranslator", () => {
    const t = createTranslator("en");
    expect(t("library.title")).toBe("Memory library");
  });
});

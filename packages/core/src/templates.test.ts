import { describe, expect, it } from "vitest";

import { SUPPORTED_LOCALES } from "@gotomemory/i18n";

import { memoryTemplates, pickUnappliedTemplates, suggestMemorableLines } from "./templates.js";

describe("memory templates (spec §5.0)", () => {
  it.each(SUPPORTED_LOCALES)("ships 5-8 starter memories in %s", (locale) => {
    const templates = memoryTemplates(locale);

    expect(templates.length).toBeGreaterThanOrEqual(5);
    expect(templates.length).toBeLessThanOrEqual(8);
    for (const template of templates) {
      expect(template.content.length).toBeGreaterThan(0);
      expect(template.source).toBe("manual");
      expect(["preference", "fact", "project", "other"]).toContain(template.category);
    }
  });

  it("seeds English users with English memories", () => {
    for (const template of memoryTemplates("en")) {
      expect(template.content).not.toMatch(/[一-龥]/);
    }
    expect(memoryTemplates("zh")[0]!.content).toMatch(/[一-龥]/);
  });

  it("re-applying skips templates the user already has", () => {
    const templates = memoryTemplates("zh");
    const existing = [{ content: templates[0]!.content }];

    const unapplied = pickUnappliedTemplates(existing, "zh");

    expect(unapplied).toHaveLength(templates.length - 1);
    expect(unapplied.map((t) => t.content)).not.toContain(templates[0]!.content);
    expect(
      pickUnappliedTemplates(
        templates.map((t) => ({ content: t.content })),
        "zh"
      )
    ).toEqual([]);
  });

  it("offers the current language's seeds even when the other language is saved", () => {
    const saved = memoryTemplates("zh").map((t) => ({ content: t.content }));

    expect(pickUnappliedTemplates(saved, "en")).toHaveLength(memoryTemplates("en").length);
  });
});

describe("post-export save suggestions (spec §2.1)", () => {
  it("suggests short user lines that read like preferences or facts", () => {
    const suggestions = suggestMemorableLines([
      { role: "user", content: "以后代码示例优先用 TypeScript" },
      { role: "assistant", content: "好的，我优先用 TypeScript" },
      { role: "user", content: "帮我看看这段报错" },
      { role: "user", content: `这个项目的目标是跨助手记忆${"，细节很多".repeat(30)}` }
    ]);

    expect(suggestions).toEqual([
      { content: "以后代码示例优先用 TypeScript", category: "preference" }
    ]);
  });

  it("caps the number of suggestions and dedups repeats", () => {
    const line = (n: number) => ({ role: "user" as const, content: `我习惯用工具 ${n}` });
    const suggestions = suggestMemorableLines([line(1), line(1), line(2), line(3), line(4)], 3);
    expect(suggestions).toHaveLength(3);
  });
});

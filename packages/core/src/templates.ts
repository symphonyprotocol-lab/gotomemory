import type { ConversationMessage, Memory, SaveMemoryRequest } from "@gotomemory/contracts";
import { FALLBACK_LOCALE, type Locale } from "@gotomemory/i18n";

import { inferCategory } from "./category.js";

/**
 * Starter memories (spec §5.0 首周价值曲线): one-click seeds so the inject panel
 * is useful from day one. They are ordinary memories once saved — editable,
 * deletable, pausable.
 *
 * These are seeded *into a conversation with an assistant*, so they follow the
 * UI language: an English-speaking user asking for "回答一律使用中文" would be
 * seeding the opposite of what they want. Content and category live together
 * here rather than in the UI dictionary, because the category is domain logic.
 */
export const MEMORY_TEMPLATES: Readonly<Record<Locale, readonly SaveMemoryRequest[]>> = {
  zh: [
    { content: "回答一律使用中文。", category: "preference", source: "manual" },
    { content: "代码示例优先用 TypeScript。", category: "preference", source: "manual" },
    { content: "回答先给结论，再给理由，保持简洁。", category: "preference", source: "manual" },
    { content: "解释新概念时，给一个最小可运行的例子。", category: "preference", source: "manual" },
    { content: "改代码时保持现有风格，不做无关重构。", category: "preference", source: "manual" },
    { content: "涉及命令行时，默认 macOS 和 zsh 环境。", category: "preference", source: "manual" },
    { content: "我是一名软件工程师。", category: "fact", source: "manual" }
  ],
  en: [
    { content: "Always answer in English.", category: "preference", source: "manual" },
    { content: "Prefer TypeScript for code examples.", category: "preference", source: "manual" },
    {
      content: "Lead with the conclusion, then the reasoning. Keep it short.",
      category: "preference",
      source: "manual"
    },
    {
      content: "When explaining a new concept, include a minimal runnable example.",
      category: "preference",
      source: "manual"
    },
    {
      content: "When changing code, match the existing style and avoid unrelated refactors.",
      category: "preference",
      source: "manual"
    },
    {
      content: "Assume macOS and zsh for command-line instructions.",
      category: "preference",
      source: "manual"
    },
    { content: "I am a software engineer.", category: "fact", source: "manual" }
  ]
};

/** The starter memories for one language. */
export function memoryTemplates(locale: Locale = FALLBACK_LOCALE): readonly SaveMemoryRequest[] {
  return MEMORY_TEMPLATES[locale];
}

/**
 * Templates whose content is not already saved, so re-applying never
 * duplicates. Only the current language's set is considered — a user who
 * switched languages gets that language's seeds, not a merge of both.
 */
export function pickUnappliedTemplates(
  existing: readonly Pick<Memory, "content">[],
  locale: Locale = FALLBACK_LOCALE
): SaveMemoryRequest[] {
  const saved = new Set(existing.map((memory) => memory.content.trim()));
  return memoryTemplates(locale).filter((template) => !saved.has(template.content.trim()));
}

// A memorable line is a short standalone statement; long messages are tasks or
// pasted material, not durable preferences/facts.
const MAX_MEMORABLE_LENGTH = 120;

/**
 * Post-export save suggestion (spec §2.1): pick the user's lines that read like
 * durable preferences/facts/project background, so "export brought you here,
 * memory keeps you" has a concrete hand-off moment.
 */
export function suggestMemorableLines(
  messages: readonly ConversationMessage[],
  limit = 3
): SaveMemoryRequest[] {
  const suggestions: SaveMemoryRequest[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }
    const content = message.content.trim();
    if (content.length === 0 || content.length > MAX_MEMORABLE_LENGTH || seen.has(content)) {
      continue;
    }
    const category = inferCategory(content);
    if (category === "other") {
      continue;
    }
    seen.add(content);
    suggestions.push({ content, category });
    if (suggestions.length >= limit) {
      break;
    }
  }
  return suggestions;
}

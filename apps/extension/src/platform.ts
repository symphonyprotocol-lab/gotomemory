export type Platform = "chatgpt" | "claude" | "gemini";

const HOSTS: Array<[RegExp, Platform]> = [
  [/(^|\.)chatgpt\.com$/, "chatgpt"],
  [/(^|\.)chat\.openai\.com$/, "chatgpt"],
  [/(^|\.)claude\.ai$/, "claude"],
  [/(^|\.)gemini\.google\.com$/, "gemini"],
];

/** Detect which AI platform a hostname belongs to (system spec §16.2 platform detection). */
export function detectPlatform(hostname: string): Platform | null {
  for (const [re, platform] of HOSTS) {
    if (re.test(hostname)) return platform;
  }
  return null;
}

/**
 * Candidate selectors for each platform's chat input, most specific first. Web UIs change
 * often, so this is a best-effort list with broad fallbacks (a generic contenteditable, then
 * any textarea); update here when a platform reworks its composer.
 */
export const EDITOR_SELECTORS: Record<Platform, string[]> = {
  chatgpt: ["#prompt-textarea", "div[contenteditable='true']", "textarea"],
  claude: ["div.ProseMirror[contenteditable='true']", "div[contenteditable='true']", "textarea"],
  gemini: [
    "rich-textarea div[contenteditable='true']",
    "div.ql-editor[contenteditable='true']",
    "div[contenteditable='true']",
    "textarea",
  ],
};

/** First matching chat-input element for the platform, or null. Structural arg = testable. */
export function findEditor(
  root: { querySelector(selectors: string): Element | null },
  platform: Platform,
): Element | null {
  for (const selector of EDITOR_SELECTORS[platform]) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return null;
}

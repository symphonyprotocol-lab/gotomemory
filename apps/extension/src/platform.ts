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

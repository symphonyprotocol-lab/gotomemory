export { type AdapterInput, type CapabilityManifest, wrapMemory } from "./types.js";
export { buildChatGPTPayload, type ChatGPTPayload, CHATGPT_MANIFEST } from "./chatgpt.js";
export { buildClaudePayload, type ClaudePayload, CLAUDE_MANIFEST } from "./claude.js";
export { buildGeminiPayload, type GeminiPayload, GEMINI_MANIFEST } from "./gemini.js";

import { CHATGPT_MANIFEST } from "./chatgpt.js";
import { CLAUDE_MANIFEST } from "./claude.js";
import { GEMINI_MANIFEST } from "./gemini.js";
import type { CapabilityManifest } from "./types.js";

export type Platform = "chatgpt" | "claude" | "gemini";

export const MANIFESTS: Record<Platform, CapabilityManifest> = {
  chatgpt: CHATGPT_MANIFEST,
  claude: CLAUDE_MANIFEST,
  gemini: GEMINI_MANIFEST,
};

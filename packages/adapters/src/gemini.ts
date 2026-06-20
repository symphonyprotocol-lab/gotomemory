import { type AdapterInput, type CapabilityManifest, wrapMemory } from "./types.js";

export const GEMINI_MANIFEST: CapabilityManifest = {
  apiFamily: "google.generateContent",
  payloadStrategy: "systemInstruction + contents context block",
  memoryAuthority: "low",
  maxContextTokens: 8000,
  supportsToolResultMemory: false,
  supportsMidConversationInstruction: false,
  version: "2026-06-01",
};

export interface GeminiPayload {
  systemInstruction: { parts: Array<{ text: string }> };
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
}

/**
 * Gemini generateContent: behavior rules use `systemInstruction`; memory goes into
 * `contents` as its own block — never mixed into the system behavior rules (§7.3).
 */
export function buildGeminiPayload(input: AdapterInput): GeminiPayload {
  const contents: GeminiPayload["contents"] = [];
  if (input.memoryContext) {
    contents.push({ role: "user", parts: [{ text: wrapMemory(input.memoryContext) }] });
  }
  contents.push({ role: "user", parts: [{ text: input.userMessage }] });
  return { systemInstruction: { parts: [{ text: input.instructionRules }] }, contents };
}

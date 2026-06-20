import { type AdapterInput, type CapabilityManifest, wrapMemory } from "./types.js";

export const CHATGPT_MANIFEST: CapabilityManifest = {
  apiFamily: "openai.responses",
  payloadStrategy: "instructions + input context block",
  memoryAuthority: "low",
  maxContextTokens: 8000,
  supportsToolResultMemory: true,
  supportsMidConversationInstruction: true,
  version: "2026-06-01",
};

export interface ChatGPTPayload {
  instructions: string;
  input: Array<{ role: "user" | "developer"; content: string }>;
}

/**
 * OpenAI Responses API: behavior rules go in `instructions`; user-authorized memory goes
 * into `input` as a bounded context block, never promoted to a high-authority instruction.
 */
export function buildChatGPTPayload(input: AdapterInput): ChatGPTPayload {
  const items: ChatGPTPayload["input"] = [];
  if (input.memoryContext) {
    items.push({ role: "user", content: wrapMemory(input.memoryContext) });
  }
  items.push({ role: "user", content: input.userMessage });
  return { instructions: input.instructionRules, input: items };
}

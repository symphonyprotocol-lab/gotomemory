import { type AdapterInput, type CapabilityManifest, wrapMemory } from "./types.js";

export const CLAUDE_MANIFEST: CapabilityManifest = {
  apiFamily: "anthropic.messages",
  payloadStrategy: "top-level system + user-turn context block or tool result",
  memoryAuthority: "low",
  maxContextTokens: 8000,
  supportsToolResultMemory: true,
  // Claude Messages API has no mid-conversation system message (verified against the
  // Anthropic API docs): messages are user/assistant only, system is top-level (§7.3).
  supportsMidConversationInstruction: false,
  version: "2026-06-01",
};

export interface ClaudePayload {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * Anthropic Messages API: stable rules use the top-level `system`; memory is injected as a
 * `user`-turn context block (or tool result), never disguised as a system instruction.
 */
export function buildClaudePayload(input: AdapterInput): ClaudePayload {
  const messages: ClaudePayload["messages"] = [];
  if (input.memoryContext) {
    messages.push({ role: "user", content: wrapMemory(input.memoryContext) });
  }
  messages.push({ role: "user", content: input.userMessage });
  return { system: input.instructionRules, messages };
}

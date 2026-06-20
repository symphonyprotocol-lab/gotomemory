import { describe, expect, it } from "vitest";
import { buildChatGPTPayload } from "./chatgpt.js";
import { buildClaudePayload, CLAUDE_MANIFEST } from "./claude.js";
import { buildGeminiPayload } from "./gemini.js";
import { MANIFESTS } from "./index.js";

const input = {
  instructionRules: "You are a helpful assistant.",
  memoryContext: "- user prefers TypeScript",
  userMessage: "write a function",
};

describe("adapters keep memory in the low-privilege slot", () => {
  it("ChatGPT: rules in instructions, memory in input (not instructions)", () => {
    const p = buildChatGPTPayload(input);
    expect(p.instructions).toBe(input.instructionRules);
    expect(p.instructions).not.toContain("TypeScript");
    expect(JSON.stringify(p.input)).toContain("USER-AUTHORIZED MEMORY");
    expect(p.input.at(-1)?.content).toBe("write a function");
  });

  it("Claude: memory in a user turn, never in system", () => {
    const p = buildClaudePayload(input);
    expect(p.system).toBe(input.instructionRules);
    expect(p.system).not.toContain("TypeScript");
    expect(p.messages[0]?.role).toBe("user");
    expect(p.messages[0]?.content).toContain("USER-AUTHORIZED MEMORY");
    expect(CLAUDE_MANIFEST.supportsMidConversationInstruction).toBe(false);
  });

  it("Gemini: rules in systemInstruction, memory in contents", () => {
    const p = buildGeminiPayload(input);
    expect(JSON.stringify(p.systemInstruction)).not.toContain("TypeScript");
    expect(JSON.stringify(p.contents[0])).toContain("USER-AUTHORIZED MEMORY");
  });

  it("manifests declare api families and memory authority", () => {
    expect(MANIFESTS.chatgpt.apiFamily).toBe("openai.responses");
    expect(MANIFESTS.claude.apiFamily).toBe("anthropic.messages");
    expect(MANIFESTS.gemini.apiFamily).toBe("google.generateContent");
    for (const m of Object.values(MANIFESTS)) expect(m.memoryAuthority).toBe("low");
  });
});

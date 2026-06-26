import { describe, expect, it } from "vitest";

import { validateConversationMessages, validateSaveMemoryRequest } from "./validation.js";

describe("contracts validation", () => {
  it("normalizes save memory input", () => {
    expect(validateSaveMemoryRequest({ content: "  Use TypeScript  " })).toEqual({
      content: "Use TypeScript",
      source: undefined,
      category: undefined,
      is_private: undefined
    });
  });

  it("rejects invalid memory category", () => {
    expect(() => validateSaveMemoryRequest({ content: "x", category: "secret" })).toThrow(
      "category is invalid"
    );
  });

  it("validates shared conversation messages", () => {
    expect(validateConversationMessages([{ role: "assistant", content: "ok" }])).toEqual([
      { role: "assistant", content: "ok" }
    ]);
  });

  it("rejects empty conversation message lists", () => {
    expect(() => validateConversationMessages([])).toThrow("at least one message");
  });
});

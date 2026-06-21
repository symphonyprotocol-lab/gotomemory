import { describe, expect, it } from "vitest";
import { detectPlatform } from "./platform.js";

describe("detectPlatform", () => {
  it("recognizes the supported AI web hosts", () => {
    expect(detectPlatform("chatgpt.com")).toBe("chatgpt");
    expect(detectPlatform("chat.openai.com")).toBe("chatgpt");
    expect(detectPlatform("claude.ai")).toBe("claude");
    expect(detectPlatform("gemini.google.com")).toBe("gemini");
  });

  it("returns null for unrelated or look-alike hosts", () => {
    expect(detectPlatform("example.com")).toBeNull();
    expect(detectPlatform("notclaude.ai.evil.com")).toBeNull();
  });
});

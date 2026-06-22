import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type StorageArea } from "./config.js";
import { composeTextareaValue } from "./inject.js";
import { isExtMessage } from "./messages.js";
import { detectPlatform, EDITOR_SELECTORS, findEditor } from "./platform.js";
import { escapeHtml, renderResults } from "./render.js";

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

describe("findEditor", () => {
  it("returns the first matching selector for the platform", () => {
    const second = EDITOR_SELECTORS.claude[1]!;
    const el = {} as Element;
    const root = { querySelector: (s: string) => (s === second ? el : null) };
    expect(findEditor(root, "claude")).toBe(el);
  });

  it("returns null when no candidate matches", () => {
    expect(findEditor({ querySelector: () => null }, "chatgpt")).toBeNull();
  });
});

describe("config", () => {
  it("fills defaults for missing/blank fields", async () => {
    const area: StorageArea = { get: vi.fn().mockResolvedValue({}), set: vi.fn() };
    expect(await loadSettings(area)).toEqual(DEFAULT_SETTINGS);

    const partial: StorageArea = {
      get: vi.fn().mockResolvedValue({ settings: { token: " t9:uX " } }),
      set: vi.fn(),
    };
    const s = await loadSettings(partial);
    expect(s.token).toBe("t9:uX");
    expect(s.baseUrl).toBe(DEFAULT_SETTINGS.baseUrl);
  });

  it("persists settings under the settings key", async () => {
    const set = vi.fn();
    await saveSettings({ get: vi.fn(), set } as StorageArea, {
      baseUrl: "http://x/v1",
      token: "t:u",
    });
    expect(set).toHaveBeenCalledWith({ settings: { baseUrl: "http://x/v1", token: "t:u" } });
  });
});

describe("messages", () => {
  it("guards the message protocol", () => {
    expect(isExtMessage({ type: "INJECT", text: "x" })).toBe(true);
    expect(isExtMessage({ type: "PING" })).toBe(true);
    expect(isExtMessage({ type: "nope" })).toBe(false);
    expect(isExtMessage(null)).toBe(false);
  });
});

describe("inject", () => {
  it("appends below an existing draft, but not when empty", () => {
    expect(composeTextareaValue("", "ctx")).toBe("ctx");
    expect(composeTextareaValue("draft", "ctx")).toBe("draft\n\nctx");
  });
});

describe("render", () => {
  it("escapes untrusted preview text", () => {
    expect(escapeHtml('<img src=x onerror="1">')).toBe("&lt;img src=x onerror=&quot;1&quot;&gt;");
  });

  it("escapes inside rendered results", () => {
    const html = renderResults([
      {
        id: "a",
        summary_preview: "<script>",
        sensitivity: "normal",
        version: 1,
        score: 1,
        access: { can_read_content: true, can_inject: true, requires_confirmation: false },
      },
    ]);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

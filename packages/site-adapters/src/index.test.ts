// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { adapters, applySelectorOverrides, getAdapterForUrl } from "./index.js";

describe("site adapters", () => {
  it("resolves adapters by exact product hosts", () => {
    expect(getAdapterForUrl("https://chatgpt.com/c/1")?.platform).toBe("chatgpt");
    expect(getAdapterForUrl("https://claude.ai/chat/1")?.platform).toBe("claude");
    expect(getAdapterForUrl("https://gemini.google.com/app")?.platform).toBe("gemini");
  });

  it("extracts ChatGPT messages from rendered DOM", () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user">Please remember TypeScript</div>
        <div data-message-author-role="assistant">Saved.</div>
      </main>
    `;

    expect(adapters.chatgpt.extractMessages()).toEqual([
      { role: "user", content: "Please remember TypeScript", timestamp: null },
      { role: "assistant", content: "Saved.", timestamp: null }
    ]);
  });

  it("inserts context into textareas and dispatches input", () => {
    document.body.innerHTML = "<textarea></textarea>";
    const textarea = document.querySelector("textarea");
    let fired = false;
    textarea?.addEventListener("input", () => {
      fired = true;
    });

    expect(adapters.chatgpt.insertIntoPrompt("Memory context")).toBe(true);
    expect(textarea?.value).toBe("Memory context");
    expect(fired).toBe(true);
  });

  it("inserts context into a contenteditable composer (ChatGPT/Claude editors)", () => {
    document.body.innerHTML = `<div contenteditable="true"></div>`;
    const editor = document.querySelector<HTMLElement>("[contenteditable='true']");
    let fired = false;
    editor?.addEventListener("input", () => {
      fired = true;
    });

    expect(adapters.chatgpt.insertIntoPrompt("Memory context")).toBe(true);
    expect(editor?.textContent).toContain("Memory context");
    expect(fired).toBe(true);
  });

  it("finds a UI mount point without coupling core to DOM", () => {
    document.body.innerHTML = "<main></main>";
    expect(adapters.claude.findMount()?.tagName).toBe("MAIN");
  });

  it("parses the conversation id from each platform's URL", () => {
    expect(adapters.chatgpt.conversationId("https://chatgpt.com/c/abc-123")).toBe("abc-123");
    expect(adapters.claude.conversationId("https://claude.ai/chat/xyz-789?x=1")).toBe("xyz-789");
    expect(adapters.gemini.conversationId("https://gemini.google.com/app/g42")).toBe("g42");
    expect(adapters.chatgpt.conversationId("https://chatgpt.com/")).toBeNull();
  });

  it("extracts Claude turns, dropping the streaming wrapper for clean inner text", () => {
    // Mirrors Claude's real DOM: a `[data-is-streaming]` wrapper holds both the
    // user message and the `.font-claude-response` answer, so the wrapper must be
    // ignored in favor of the clean inner elements.
    document.body.innerHTML = `
      <main>
        <div data-is-streaming="false">
          <div data-testid="user-message">my question</div>
          <div class="font-claude-response">the assistant answer</div>
        </div>
      </main>`;
    expect(adapters.claude.extractMessages()).toEqual([
      { role: "user", content: "my question", timestamp: null },
      { role: "assistant", content: "the assistant answer", timestamp: null }
    ]);
  });

  it("removes a previously inserted block from the composer (trust-mode undo)", () => {
    document.body.innerHTML = "<textarea>my draft</textarea>";
    const textarea = document.querySelector("textarea");

    expect(adapters.chatgpt.insertIntoPrompt("injected memories")).toBe(true);
    expect(textarea?.value).toBe("my draft\n\ninjected memories");

    expect(adapters.chatgpt.removeFromPrompt("injected memories")).toBe(true);
    expect(textarea?.value).toBe("my draft");
    // A second undo is a no-op.
    expect(adapters.chatgpt.removeFromPrompt("injected memories")).toBe(false);
  });

  it("prefers the platform composer over stray editables (priority list)", () => {
    // A stray editable earlier in DOM order must not hijack insertion when the
    // real composer anchor (#prompt-textarea) is present.
    document.body.innerHTML = `
      <div contenteditable="true" data-stray></div>
      <div id="prompt-textarea" contenteditable="true"></div>`;

    expect(adapters.chatgpt.insertIntoPrompt("Memory context")).toBe(true);
    expect(document.querySelector("#prompt-textarea")?.textContent).toContain("Memory context");
    expect(document.querySelector("[data-stray]")?.textContent).toBe("");
  });

  it("survives an invalid alternative in the selector priority list", () => {
    const original = adapters.chatgpt.inputSelector;
    try {
      applySelectorOverrides(adapters, {
        chatgpt: { inputSelector: ":::not-a-selector, textarea" }
      });
      document.body.innerHTML = "<textarea></textarea>";
      expect(adapters.chatgpt.insertIntoPrompt("still works")).toBe(true);
      expect(document.querySelector("textarea")?.value).toBe("still works");
    } finally {
      applySelectorOverrides(adapters, { chatgpt: { inputSelector: original } });
    }
  });

  it("undoes an injected block in a contenteditable whose newlines became <br>", () => {
    // Real rich-text composers re-render inserted "\n" as element boundaries,
    // so textContent no longer contains the newlines we inserted (observed
    // live in the extension E2E). Undo must still find and remove the block.
    document.body.innerHTML =
      `<div contenteditable="true">my draft<br>以下是用户授权的相关记忆。<br>` +
      `记忆：<br>- 以后代码示例优先用 TypeScript</div>`;

    const removed = adapters.chatgpt.removeFromPrompt(
      "以下是用户授权的相关记忆。\n记忆：\n- 以后代码示例优先用 TypeScript"
    );

    expect(removed).toBe(true);
    const editor = document.querySelector("[contenteditable]");
    expect(editor?.textContent).toContain("my draft");
    expect(editor?.textContent).not.toContain("TypeScript");
    // A second undo finds nothing.
    expect(adapters.chatgpt.removeFromPrompt("以后代码示例优先用 TypeScript")).toBe(false);
  });

  describe("remote selector overrides", () => {
    const original = adapters.chatgpt.messageSelector;
    afterEach(() => {
      applySelectorOverrides(adapters, { chatgpt: { messageSelector: original } });
    });

    it("changes live extraction behavior after being applied", () => {
      document.body.innerHTML = `
        <main>
          <div data-message-author-role="user">old markup</div>
          <div data-new-turn="user">new markup</div>
        </main>`;

      expect(adapters.chatgpt.extractMessages().map((m) => m.content)).toEqual(["old markup"]);

      applySelectorOverrides(adapters, { chatgpt: { messageSelector: "[data-new-turn]" } });
      expect(adapters.chatgpt.extractMessages().map((m) => m.content)).toEqual([]);
      // Role comes from the override-matched element's attributes when present.
      document.body.innerHTML = `
        <main><div data-new-turn data-message-author-role="user">new markup</div></main>`;
      expect(adapters.chatgpt.extractMessages().map((m) => m.content)).toEqual(["new markup"]);
    });
  });
});

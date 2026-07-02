// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { adapters, getAdapterForUrl } from "./index.js";

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
});

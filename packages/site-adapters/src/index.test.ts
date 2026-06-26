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
      { role: "user", content: "Please remember TypeScript" },
      { role: "assistant", content: "Saved." }
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

  it("finds a UI mount point without coupling core to DOM", () => {
    document.body.innerHTML = "<main></main>";
    expect(adapters.claude.findMount()?.tagName).toBe("MAIN");
  });
});

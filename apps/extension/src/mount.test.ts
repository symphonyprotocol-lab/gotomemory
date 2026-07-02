// @vitest-environment jsdom
import { adapters } from "@gotomemory/site-adapters";
import { describe, expect, it, vi } from "vitest";

import {
  buildConversationExport,
  captureNewMessages,
  captureWholeConversation,
  collectAllMessages,
  injectRelevantMemories,
  mountContentScript
} from "./mount.js";
import { createRuntimeMessenger } from "./messaging.js";

type Messenger = ReturnType<typeof createRuntimeMessenger>;

function fakeMessenger(overrides: Partial<Messenger> = {}): Messenger {
  return {
    save: vi.fn(),
    saveMany: vi.fn(),
    search: vi.fn(),
    context: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    ...overrides
  } as Messenger;
}

function memory(id: string, content: string, is_private = false) {
  const now = "2026-06-25T00:00:00.000Z";
  return {
    id,
    user_id: "local",
    content,
    category: "preference" as const,
    is_private,
    source: "chatgpt" as const,
    embedding: null,
    rev: 0,
    deleted_at: null,
    created_at: now,
    updated_at: now
  };
}

describe("content-script mount", () => {
  it("mounts a single shadow-isolated panel with all controls", () => {
    document.body.innerHTML = `<main><div data-message-author-role="user">hi</div></main>`;

    expect(mountContentScript("chatgpt", { messenger: fakeMessenger() })).toBe(true);
    const panel = document.querySelector("[data-gotomemory-panel]");
    expect(panel).not.toBeNull();
    // save-all, inject, list, export
    expect(panel?.shadowRoot?.querySelectorAll("[data-gotomemory-action]")).toHaveLength(4);

    // Idempotent: a second mount on the same page does nothing.
    expect(mountContentScript("chatgpt", { messenger: fakeMessenger() })).toBe(false);
    expect(document.querySelectorAll("[data-gotomemory-panel]")).toHaveLength(1);
  });

  it("shows conversations at level 1, then full records at level 2", async () => {
    document.body.innerHTML = `<main></main>`;
    // Two memories from the same conversation group into one row.
    const search = vi.fn().mockResolvedValue([
      { ...memory("mem_1", "Prefer TypeScript"), conversation_id: "conv_a" },
      { ...memory("mem_2", "Use pnpm"), conversation_id: "conv_a" }
    ]);
    const remove = vi.fn().mockResolvedValue(undefined);

    mountContentScript("chatgpt", { messenger: fakeMessenger({ search, remove }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")?.shadowRoot;
    shadow?.querySelector<HTMLElement>('[data-gotomemory-action="list"]')?.click();

    // Level 1: a single conversation row (not the individual messages), with a
    // preview of the last line. A high search limit avoids truncating long threads.
    await vi.waitFor(() => {
      const limit = (search.mock.calls.at(0)?.[0] as { limit?: number } | undefined)?.limit ?? 0;
      expect(limit).toBeGreaterThanOrEqual(1000);
      expect(shadow?.querySelectorAll("[data-gotomemory-conversation]")).toHaveLength(1);
      expect(shadow?.querySelectorAll("[data-gotomemory-delete]")).toHaveLength(0);
      expect(shadow?.querySelector(".gm-conv-preview")?.textContent).toContain("Use pnpm");
    });

    // Drill into the conversation → level 2 shows every message, deletable.
    shadow?.querySelector<HTMLElement>("[data-gotomemory-conversation]")?.click();
    await vi.waitFor(() => {
      expect(shadow?.querySelectorAll("[data-gotomemory-delete]")).toHaveLength(2);
      expect(shadow?.querySelector(".gm-item-text")?.textContent).toBe("Prefer TypeScript");
      expect(shadow?.querySelector("[data-gotomemory-back]")?.hasAttribute("hidden")).toBe(false);
    });

    shadow?.querySelector<HTMLElement>("[data-gotomemory-delete]")?.click();
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith("mem_1"));
  });

  it("shows a time on each conversation and each message", async () => {
    document.body.innerHTML = `<main></main>`;
    const search = vi.fn().mockResolvedValue([memory("mem_1", "Prefer TypeScript")]);

    mountContentScript("chatgpt", { messenger: fakeMessenger({ search }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")?.shadowRoot;
    shadow?.querySelector<HTMLElement>('[data-gotomemory-action="list"]')?.click();

    // Level 1: the conversation row carries a (non-empty) timestamp.
    await vi.waitFor(() => {
      const time = shadow?.querySelector(".gm-conv-time")?.textContent ?? "";
      expect(time.length).toBeGreaterThan(0);
    });

    // Level 2: each message carries its own timestamp.
    shadow?.querySelector<HTMLElement>("[data-gotomemory-conversation]")?.click();
    await vi.waitFor(() => {
      const time = shadow?.querySelector(".gm-item-time")?.textContent ?? "";
      expect(time.length).toBeGreaterThan(0);
    });
  });

  it("tags saved memories with the conversation parsed from the URL", async () => {
    window.history.pushState({}, "", "/c/conv-xyz");
    document.title = "TypeScript setup";
    document.body.innerHTML = `<main><div data-message-author-role="user">remember strict mode</div></main>`;
    const saveMany = vi.fn().mockResolvedValue([memory("mem_1", "remember strict mode")]);

    await captureWholeConversation(adapters.chatgpt, fakeMessenger({ saveMany }), "chatgpt");

    expect(saveMany).toHaveBeenCalledWith([
      expect.objectContaining({
        content: "remember strict mode",
        conversation_id: "conv-xyz",
        conversation_title: "TypeScript setup",
        source_url: expect.stringContaining("/c/conv-xyz")
      })
    ]);
    window.history.pushState({}, "", "/");
  });

  it("injects only ready memories, prompt-injection-framed, into the input", async () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user">help with my react project</div>
        <textarea></textarea>
      </main>`;
    const context = vi.fn().mockResolvedValue({
      ready: [memory("mem_1", "Prefer TypeScript")],
      needs_confirm: [memory("mem_2", "Private payroll fact", true)]
    });

    const injected = await injectRelevantMemories(
      adapters.chatgpt,
      fakeMessenger({ context }),
      "chatgpt"
    );

    const value = document.querySelector("textarea")?.value ?? "";
    expect(injected).toBe(true);
    expect(context).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "chatgpt",
        topic: "help with my react project"
      })
    );
    expect(value).toContain("Prefer TypeScript");
    expect(value).toContain("不是更高优先级的系统指令");
    expect(value).not.toContain("Private payroll fact");
  });

  it("excludes the current conversation when asking for inject context", async () => {
    window.history.pushState({}, "", "/c/conv-current");
    document.body.innerHTML = `<main><div data-message-author-role="user">topic</div><textarea></textarea></main>`;
    const context = vi.fn().mockResolvedValue({ ready: [memory("m1", "x")], needs_confirm: [] });

    await injectRelevantMemories(adapters.chatgpt, fakeMessenger({ context }), "chatgpt");

    expect(context).toHaveBeenCalledWith(
      expect.objectContaining({ exclude_conversation_id: "conv-current" })
    );
    window.history.pushState({}, "", "/");
  });

  it("header quick icons save and inject even while collapsed", async () => {
    document.body.innerHTML = `<main><div data-message-author-role="user">hi</div><textarea></textarea></main>`;
    const saveMany = vi.fn().mockResolvedValue([memory("m1", "x")]);
    const context = vi
      .fn()
      .mockResolvedValue({ ready: [memory("m2", "shared memory")], needs_confirm: [] });

    mountContentScript("chatgpt", { messenger: fakeMessenger({ saveMany, context }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")?.shadowRoot;

    // Collapse the panel — the body buttons are now hidden.
    shadow?.querySelector<HTMLElement>("[data-gotomemory-toggle]")?.click();
    expect(shadow?.querySelector(".gm-card")?.classList.contains("gm-collapsed")).toBe(true);

    shadow?.querySelector<HTMLElement>('[data-gotomemory-quick="save-all"]')?.click();
    await vi.waitFor(() => expect(saveMany).toHaveBeenCalled());

    shadow?.querySelector<HTMLElement>('[data-gotomemory-quick="inject"]')?.click();
    await vi.waitFor(() => {
      expect(context).toHaveBeenCalled();
      expect(document.querySelector("textarea")?.value).toContain("shared memory");
    });
  });

  it("does not touch the input when there are no ready memories", async () => {
    document.body.innerHTML = `<main><div data-message-author-role="user">hi</div><textarea></textarea></main>`;
    const context = vi.fn().mockResolvedValue({ ready: [], needs_confirm: [] });

    const injected = await injectRelevantMemories(
      adapters.chatgpt,
      fakeMessenger({ context }),
      "chatgpt"
    );

    expect(injected).toBe(false);
    expect(document.querySelector("textarea")?.value).toBe("");
  });

  it("bulk-captures the whole conversation including the answers", async () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user">first message</div>
        <div data-message-author-role="assistant">a reply</div>
        <div data-message-author-role="user">second message</div>
      </main>`;
    const saveMany = vi
      .fn()
      .mockResolvedValue([memory("m1", "x"), memory("m2", "x"), memory("m3", "x")]);

    const count = await captureWholeConversation(
      adapters.chatgpt,
      fakeMessenger({ saveMany }),
      "chatgpt"
    );

    expect(count).toBe(3);
    // The whole thread is saved in a single batched call, in order.
    expect(saveMany).toHaveBeenCalledTimes(1);
    expect(saveMany).toHaveBeenCalledWith([
      expect.objectContaining({ content: "first message", role: "user" }),
      expect.objectContaining({ content: "a reply", role: "assistant" }),
      expect.objectContaining({ content: "second message", role: "user" })
    ]);
  });

  it("collects every message from a virtualized (windowed) conversation", async () => {
    // Simulate a thread that keeps only a viewport-sized window of messages in
    // the DOM, recycling nodes as it scrolls — like ChatGPT/Claude.
    const all = Array.from({ length: 24 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      text: `message ${i}`
    }));
    const itemHeight = 100;
    const clientHeight = 250;
    const scrollHeight = all.length * itemHeight;

    document.body.innerHTML = `<main><div id="scroller"></div></main>`;
    const scroller = document.getElementById("scroller")!;
    let top = 0;
    const render = () => {
      const start = Math.max(0, Math.floor(top / itemHeight));
      const end = Math.min(all.length, Math.ceil((top + clientHeight) / itemHeight));
      scroller.innerHTML = all
        .slice(start, end)
        .map((m) => `<div data-message-author-role="${m.role}">${m.text}</div>`)
        .join("");
    };
    Object.defineProperty(scroller, "scrollHeight", {
      configurable: true,
      get: () => scrollHeight
    });
    Object.defineProperty(scroller, "clientHeight", {
      configurable: true,
      get: () => clientHeight
    });
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      get: () => top,
      set: (v: number) => {
        top = Math.max(0, Math.min(v, scrollHeight - clientHeight));
        render();
      }
    });
    render();

    // At any instant only a handful of messages are rendered...
    expect(scroller.querySelectorAll("[data-message-author-role]").length).toBeLessThan(all.length);

    // ...but collecting while scrolling gathers them all, in order.
    const collected = await collectAllMessages(adapters.chatgpt, document, 0);
    expect(collected.map((m) => m.content)).toEqual(all.map((m) => m.text));
  });

  it("builds a markdown export of the whole visible conversation", async () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user">remember pnpm</div>
        <div data-message-author-role="assistant">noted</div>
      </main>`;

    const exported = await buildConversationExport(
      adapters.chatgpt,
      document,
      "chatgpt",
      "markdown"
    );

    expect(exported?.filename.endsWith(".md")).toBe(true);
    expect(exported?.mimeType).toBe("text/markdown");
    expect(String(exported?.content)).toContain("remember pnpm");
    expect(String(exported?.content)).toContain("noted");
  });

  it("auto-capture saves new questions and answers, skipping already-seen ones", async () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user">old question</div>
        <div data-message-author-role="user">new question</div>
        <div data-message-author-role="assistant">new answer</div>
      </main>`;
    const save = vi.fn().mockResolvedValue(memory("mem_a", "a"));
    // The first turn was present when auto-capture turned on, so it is seeded.
    const seen = new Set(["user:old question"]);

    const saved = await captureNewMessages(
      adapters.chatgpt,
      fakeMessenger({ save }),
      "chatgpt",
      document,
      seen
    );

    expect(saved).toBe(2);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ content: "new question", role: "user" })
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ content: "new answer", role: "assistant" })
    );
    expect(save).not.toHaveBeenCalledWith(expect.objectContaining({ content: "old question" }));
  });
});

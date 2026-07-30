// @vitest-environment jsdom
//
// jsdom reports navigator.language as "en-US", so an unconfigured panel mounts
// in English — the same path a non-Chinese user gets. Chinese rendering is
// covered by the language tests at the bottom, which stub navigator.languages.
import { memoryTemplates } from "@gotomemory/core";
import { adapters, applySelectorOverrides } from "@gotomemory/site-adapters";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    search: vi.fn().mockResolvedValue([]),
    context: vi.fn().mockResolvedValue({ ready: [], needs_confirm: [] }),
    update: vi.fn(),
    remove: vi.fn(),
    removeMany: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getSettings: vi
      .fn()
      .mockResolvedValue({ onboarded: true, trust_mode: false, metrics_enabled: true }),
    updateSettings: vi.fn(),
    recordMetric: vi.fn(),
    getMetrics: vi.fn().mockResolvedValue({
      state: {},
      summary: { current_week_injects: 0, average_weekly_injects: 0 }
    }),
    getSelectorOverrides: vi.fn().mockResolvedValue(null),
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
    // export, save-all, inject, list, templates (templates lives in the settings drawer)
    expect(panel?.shadowRoot?.querySelectorAll("[data-gotomemory-action]")).toHaveLength(5);

    // Idempotent: a second mount on the same page does nothing.
    expect(mountContentScript("chatgpt", { messenger: fakeMessenger() })).toBe(false);
    expect(document.querySelectorAll("[data-gotomemory-panel]")).toHaveLength(1);
  });

  it("keeps the transient prompts truly hidden at rest", () => {
    // Regression: the suggest box and undo link set their own `display`
    // (flex / inline via all:unset), which overrides the [hidden] attribute's
    // UA display:none unless the panel style force-resets it. jsdom does not
    // apply stylesheet rules, so guard both the attribute state and the reset.
    document.body.innerHTML = `<main></main>`;
    mountContentScript("chatgpt", { messenger: fakeMessenger() });
    const shadow = document.querySelector("[data-gotomemory-panel]")?.shadowRoot;

    expect(shadow?.querySelector("[data-gotomemory-suggest]")?.hasAttribute("hidden")).toBe(true);
    expect(shadow?.querySelector("[data-gotomemory-undo]")?.hasAttribute("hidden")).toBe(true);
    expect(shadow?.querySelector("style")?.textContent).toContain(
      "[hidden] { display: none !important; }"
    );
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

  it("renders a conversation oldest-first, whatever order the store returns", async () => {
    document.body.innerHTML = `<main></main>`;
    // The store lists newest-first, so search hands back reverse chronology.
    const search = vi.fn().mockResolvedValue([
      {
        ...memory("mem_3", "third"),
        conversation_id: "conv_a",
        created_at: "2026-06-25T00:00:02.000Z"
      },
      {
        ...memory("mem_2", "second"),
        conversation_id: "conv_a",
        created_at: "2026-06-25T00:00:01.000Z"
      },
      {
        ...memory("mem_1", "first"),
        conversation_id: "conv_a",
        created_at: "2026-06-25T00:00:00.000Z"
      }
    ]);

    mountContentScript("chatgpt", { messenger: fakeMessenger({ search }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")!.shadowRoot!;
    shadow.querySelector<HTMLElement>('[data-gotomemory-action="list"]')!.click();

    // The level-1 preview is the LAST message of the thread, not the first.
    await vi.waitFor(() => {
      expect(shadow.querySelector(".gm-conv-preview")?.textContent).toContain("third");
    });

    // Level 2 replays the conversation in the order it happened.
    shadow.querySelector<HTMLElement>("[data-gotomemory-conversation]")!.click();
    await vi.waitFor(() => {
      const lines = Array.from(shadow.querySelectorAll(".gm-item-text"), (n) => n.textContent);
      expect(lines).toEqual(["first", "second", "third"]);
    });
  });

  it("confirms before deleting a conversation and deletes it in one batch", async () => {
    document.body.innerHTML = `<main></main>`;
    const search = vi.fn().mockResolvedValue([
      { ...memory("mem_1", "one"), conversation_id: "conv_a" },
      { ...memory("mem_2", "two"), conversation_id: "conv_a" }
    ]);
    const removeMany = vi.fn().mockResolvedValue(undefined);
    mountContentScript("chatgpt", { messenger: fakeMessenger({ search, removeMany }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")!.shadowRoot!;
    shadow.querySelector<HTMLElement>('[data-gotomemory-action="list"]')!.click();
    await vi.waitFor(() => {
      expect(shadow.querySelectorAll("[data-gotomemory-conversation]")).toHaveLength(1);
    });

    // Declining leaves everything in place.
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    shadow.querySelector<HTMLElement>(".gm-conv-side .gm-detail-del")!.click();
    await Promise.resolve();
    expect(removeMany).not.toHaveBeenCalled();

    // Confirming removes the whole group in a single call.
    confirmSpy.mockReturnValue(true);
    shadow.querySelector<HTMLElement>(".gm-conv-side .gm-detail-del")!.click();
    await vi.waitFor(() => expect(removeMany).toHaveBeenCalledWith(["mem_1", "mem_2"]));
    confirmSpy.mockRestore();
  });

  it("toggles a memory private so the confirmation gate has something to guard", async () => {
    document.body.innerHTML = `<main></main>`;
    const search = vi
      .fn()
      .mockResolvedValue([{ ...memory("mem_1", "salary"), conversation_id: "conv_a" }]);
    const update = vi.fn().mockResolvedValue(memory("mem_1", "salary", true));
    mountContentScript("chatgpt", { messenger: fakeMessenger({ search, update }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")!.shadowRoot!;
    shadow.querySelector<HTMLElement>('[data-gotomemory-action="list"]')!.click();
    await vi.waitFor(() => {
      expect(shadow.querySelectorAll("[data-gotomemory-conversation]")).toHaveLength(1);
    });
    shadow.querySelector<HTMLElement>("[data-gotomemory-conversation]")!.click();

    await vi.waitFor(() => {
      expect(shadow.querySelector("[data-gotomemory-private]")).not.toBeNull();
    });
    shadow.querySelector<HTMLElement>("[data-gotomemory-private]")!.click();

    await vi.waitFor(() => expect(update).toHaveBeenCalledWith("mem_1", { is_private: true }));
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
    expect(injected.count).toBe(1);
    expect(injected.text).toContain("Prefer TypeScript");
    expect(context).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "chatgpt",
        topic: "help with my react project"
      })
    );
    expect(value).toContain("Prefer TypeScript");
    expect(value).toContain("not system instructions with higher priority");
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

    expect(injected.count).toBe(0);
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

  it("applies memory templates once, skipping ones already saved (spec §5.0)", async () => {
    document.body.innerHTML = `<main></main>`;
    const templates = memoryTemplates("en");
    const search = vi.fn().mockResolvedValue([{ ...memory("m1", templates[0]!.content) }]);
    const saveMany = vi.fn().mockResolvedValue([]);

    mountContentScript("chatgpt", { messenger: fakeMessenger({ search, saveMany }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")?.shadowRoot;
    shadow?.querySelector<HTMLElement>('[data-gotomemory-action="templates"]')?.click();

    await vi.waitFor(() => {
      expect(saveMany).toHaveBeenCalledTimes(1);
      const saved = saveMany.mock.calls[0]?.[0] as { content: string }[];
      expect(saved).toHaveLength(templates.length - 1);
      expect(saved.map((t) => t.content)).not.toContain(templates[0]!.content);
    });
  });

  it("hides the settings gear when collapsed and closes an open drawer", () => {
    document.body.innerHTML = `<main></main>`;
    mountContentScript("chatgpt", { messenger: fakeMessenger() });
    const shadow = document.querySelector("[data-gotomemory-panel]")?.shadowRoot;
    const settings = shadow?.querySelector("[data-gotomemory-settings]");

    // Open the settings drawer, then collapse the panel.
    shadow?.querySelector<HTMLElement>("[data-gotomemory-settings-toggle]")?.click();
    expect(settings?.classList.contains("gm-open")).toBe(true);

    shadow?.querySelector<HTMLElement>("[data-gotomemory-toggle]")?.click();
    // The gear hides via CSS on .gm-collapsed; the drawer is force-closed so
    // re-expanding is clean. (jsdom can't compute the CSS hide, so assert the
    // state we drive: collapsed + drawer closed.)
    expect(shadow?.querySelector(".gm-card")?.classList.contains("gm-collapsed")).toBe(true);
    expect(settings?.classList.contains("gm-open")).toBe(false);
  });

  it("runs the busy animation only while an action is in flight", async () => {
    document.body.innerHTML = `<main><div data-message-author-role="user">hi</div></main>`;
    let release: (memories: ReturnType<typeof memory>[]) => void = () => {};
    const saveMany = vi.fn(
      () => new Promise<ReturnType<typeof memory>[]>((resolve) => (release = resolve))
    );

    mountContentScript("chatgpt", { messenger: fakeMessenger({ saveMany }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")?.shadowRoot;
    const cardEl = shadow?.querySelector(".gm-card");

    expect(cardEl?.classList.contains("gm-busy")).toBe(false);
    shadow?.querySelector<HTMLElement>('[data-gotomemory-action="save-all"]')?.click();
    await vi.waitFor(() => expect(cardEl?.classList.contains("gm-busy")).toBe(true));

    release([memory("m1", "hi")]);
    await vi.waitFor(() => expect(cardEl?.classList.contains("gm-busy")).toBe(false));
  });

  it("keeps templates and toggles in a settings drawer that the gear reveals", () => {
    document.body.innerHTML = `<main></main>`;
    mountContentScript("chatgpt", { messenger: fakeMessenger() });
    const shadow = document.querySelector("[data-gotomemory-panel]")?.shadowRoot;

    const settings = shadow?.querySelector("[data-gotomemory-settings]");
    expect(settings?.classList.contains("gm-open")).toBe(false);

    shadow?.querySelector<HTMLElement>("[data-gotomemory-settings-toggle]")?.click();
    expect(settings?.classList.contains("gm-open")).toBe(true);
    // The templates action lives inside that drawer.
    expect(settings?.querySelector('[data-gotomemory-action="templates"]')).not.toBeNull();

    shadow?.querySelector<HTMLElement>("[data-gotomemory-settings-toggle]")?.click();
    expect(settings?.classList.contains("gm-open")).toBe(false);
  });

  it("clears a stale save-suggestion when the next action runs (transient exclusivity)", async () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user">以后代码示例优先用 TypeScript</div>
        <div data-message-author-role="user">react question</div>
        <textarea></textarea>
      </main>`;
    stubDownloads();
    const context = vi
      .fn()
      .mockResolvedValue({ ready: [memory("m1", "Prefer pnpm")], needs_confirm: [] });

    mountContentScript("chatgpt", { messenger: fakeMessenger({ context }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")?.shadowRoot;

    // Export surfaces the suggestion box.
    shadow?.querySelector<HTMLElement>('[data-gotomemory-action="export"]')?.click();
    await vi.waitFor(() =>
      expect(shadow?.querySelector<HTMLElement>("[data-gotomemory-suggest]")?.hidden).toBe(false)
    );

    // A following inject clears the suggestion and shows undo instead — never both.
    shadow?.querySelector<HTMLElement>('[data-gotomemory-action="inject"]')?.click();
    await vi.waitFor(() => {
      expect(shadow?.querySelector<HTMLElement>("[data-gotomemory-suggest]")?.hidden).toBe(true);
      expect(shadow?.querySelector<HTMLElement>("[data-gotomemory-undo]")?.hidden).toBe(false);
    });
  });

  it("trust mode auto-injects visibly and undo removes the exact block (spec §6.1)", async () => {
    document.body.innerHTML = `
      <main><div data-message-author-role="user">react question</div><textarea></textarea></main>`;
    const getSettings = vi
      .fn()
      .mockResolvedValue({ onboarded: true, trust_mode: true, metrics_enabled: true });
    const context = vi
      .fn()
      .mockResolvedValue({ ready: [memory("m1", "Prefer TypeScript")], needs_confirm: [] });
    const recordMetric = vi.fn();

    mountContentScript("chatgpt", {
      messenger: fakeMessenger({ getSettings, context, recordMetric })
    });
    const shadow = document.querySelector("[data-gotomemory-panel]")?.shadowRoot;

    // Auto-injected with a visible count and an undo affordance.
    await vi.waitFor(() => {
      expect(document.querySelector("textarea")?.value).toContain("Prefer TypeScript");
      expect(shadow?.querySelector(".gm-status")?.textContent).toContain("Auto-injected 1 memory");
      expect(shadow?.querySelector<HTMLElement>("[data-gotomemory-undo]")?.hidden).toBe(false);
      expect(recordMetric).toHaveBeenCalledWith("inject");
    });

    // Undo restores the composer.
    shadow?.querySelector<HTMLElement>("[data-gotomemory-undo]")?.click();
    await vi.waitFor(() => {
      expect(document.querySelector("textarea")?.value).toBe("");
      expect(shadow?.querySelector<HTMLElement>("[data-gotomemory-undo]")?.hidden).toBe(true);
    });
  });

  it("guides a first export on first run, then marks onboarding done (spec §5.0)", async () => {
    document.body.innerHTML = `
      <main><div data-message-author-role="user">hello</div><textarea></textarea></main>`;
    stubDownloads();
    const getSettings = vi
      .fn()
      .mockResolvedValue({ onboarded: false, trust_mode: false, metrics_enabled: true });
    const updateSettings = vi.fn();

    mountContentScript("chatgpt", { messenger: fakeMessenger({ getSettings, updateSettings }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")?.shadowRoot;

    await vi.waitFor(() => {
      expect(shadow?.querySelector(".gm-status")?.textContent).toContain("Export");
    });

    shadow?.querySelector<HTMLElement>('[data-gotomemory-action="export"]')?.click();
    await vi.waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({ onboarded: true });
    });
  });

  it("suggests memorable lines after an export and saves them on click (spec §2.1)", async () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user">以后代码示例优先用 TypeScript</div>
        <div data-message-author-role="assistant">好的</div>
      </main>`;
    stubDownloads();
    const saveMany = vi.fn().mockResolvedValue([]);
    const recordMetric = vi.fn();

    mountContentScript("chatgpt", { messenger: fakeMessenger({ saveMany, recordMetric }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")?.shadowRoot;
    shadow?.querySelector<HTMLElement>('[data-gotomemory-action="export"]')?.click();

    await vi.waitFor(() => {
      const box = shadow?.querySelector<HTMLElement>("[data-gotomemory-suggest]");
      expect(box?.hidden).toBe(false);
      expect(box?.textContent).toContain("1 line here looks like a lasting preference");
      expect(box?.textContent).toContain("Save the 1 line");
      expect(recordMetric).toHaveBeenCalledWith("export");
    });

    shadow?.querySelector<HTMLElement>("[data-gotomemory-suggest-save]")?.click();
    await vi.waitFor(() => {
      expect(saveMany).toHaveBeenCalledWith([
        expect.objectContaining({
          content: "以后代码示例优先用 TypeScript",
          category: "preference",
          source: "chatgpt"
        })
      ]);
      expect(shadow?.querySelector<HTMLElement>("[data-gotomemory-suggest]")?.hidden).toBe(true);
    });
  });

  it("routes PDF export through the printable view and the browser print dialog", async () => {
    document.body.innerHTML = `
      <main><div data-message-author-role="user">把这段对话存成 PDF</div></main>`;
    stubDownloads();
    const printWindow = { addEventListener: vi.fn(), print: vi.fn() };
    const open = vi.fn(() => printWindow);
    vi.stubGlobal("open", open);
    const recordMetric = vi.fn();

    mountContentScript("chatgpt", { messenger: fakeMessenger({ recordMetric }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")?.shadowRoot;
    const select = shadow?.querySelector<HTMLSelectElement>("[data-gotomemory-format]");
    // The dropdown offers print-to-PDF, never the removed byte-level PDF writer.
    expect(select?.querySelector('option[value="pdf"]')).toBeNull();
    select!.value = "pdf-print";

    shadow?.querySelector<HTMLElement>('[data-gotomemory-action="export"]')?.click();
    await vi.waitFor(() => {
      expect(open).toHaveBeenCalledWith("blob:test", "_blank");
      expect(shadow?.querySelector(".gm-status")?.textContent).toContain("Save as PDF");
      expect(recordMetric).toHaveBeenCalledWith("export");
    });

    // The opened tab's load handler brings up the print dialog.
    const onLoad = printWindow.addEventListener.mock.calls.find(
      ([event]) => event === "load"
    )?.[1] as (() => void) | undefined;
    onLoad?.();
    expect(printWindow.print).toHaveBeenCalled();
  });

  it("warns instead of failing silently when the print popup is blocked", async () => {
    document.body.innerHTML = `
      <main><div data-message-author-role="user">再试一次</div></main>`;
    stubDownloads();
    vi.stubGlobal(
      "open",
      vi.fn(() => null)
    );
    const recordMetric = vi.fn();

    mountContentScript("chatgpt", { messenger: fakeMessenger({ recordMetric }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")?.shadowRoot;
    shadow!.querySelector<HTMLSelectElement>("[data-gotomemory-format]")!.value = "pdf-print";

    shadow?.querySelector<HTMLElement>('[data-gotomemory-action="export"]')?.click();
    await vi.waitFor(() => {
      expect(shadow?.querySelector(".gm-status")?.textContent).toContain(
        "blocked the print window"
      );
    });
    expect(recordMetric).not.toHaveBeenCalledWith("export");
  });

  it("explains a storage-quota failure instead of a generic retry message", async () => {
    document.body.innerHTML = `<main><div data-message-author-role="user">很长的对话</div></main>`;
    const saveMany = vi.fn().mockRejectedValue(new Error("Resource::kQuotaBytes quota exceeded"));

    mountContentScript("chatgpt", { messenger: fakeMessenger({ saveMany }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")?.shadowRoot;
    shadow?.querySelector<HTMLElement>('[data-gotomemory-action="save-all"]')?.click();

    await vi.waitFor(() => {
      expect(shadow?.querySelector(".gm-status")?.textContent).toContain("Storage is full");
    });
  });

  it("keeps private memories out of an inject until they are confirmed (spec §6.1)", async () => {
    document.body.innerHTML = `<main><textarea id="prompt-textarea"></textarea></main>`;
    const messenger = fakeMessenger({
      context: vi.fn().mockResolvedValue({
        ready: [memory("mem_1", "Prefer TypeScript")],
        needs_confirm: [memory("mem_2", "Salary is confidential", true)]
      })
    });
    mountContentScript("chatgpt", { messenger });
    const shadow = document.querySelector("[data-gotomemory-panel]")!.shadowRoot!;

    shadow.querySelector<HTMLElement>('[data-gotomemory-action="inject"]')!.click();
    await vi.waitFor(() => {
      expect(shadow.querySelector<HTMLElement>("[data-gotomemory-confirm]")!.hidden).toBe(false);
    });

    const textarea = document.querySelector<HTMLTextAreaElement>("#prompt-textarea")!;
    expect(textarea.value).toContain("Prefer TypeScript");
    // The private line is offered, never silently inserted.
    expect(textarea.value).not.toContain("Salary is confidential");
    expect(shadow.querySelector("[data-gotomemory-confirm-text]")!.textContent).toContain(
      "1 private memory also matches this topic"
    );

    shadow.querySelector<HTMLElement>("[data-gotomemory-confirm-accept]")!.click();
    await vi.waitFor(() => {
      expect(textarea.value).toContain("Salary is confidential");
    });
    expect(shadow.querySelector<HTMLElement>("[data-gotomemory-confirm]")!.hidden).toBe(true);
  });

  it("never auto-inserts private memories in trust mode either", async () => {
    document.body.innerHTML = `<main><textarea id="prompt-textarea"></textarea></main>`;
    const messenger = fakeMessenger({
      getSettings: vi
        .fn()
        .mockResolvedValue({ onboarded: true, trust_mode: true, metrics_enabled: false }),
      context: vi
        .fn()
        .mockResolvedValue({ ready: [], needs_confirm: [memory("mem_1", "private thing", true)] })
    });
    mountContentScript("chatgpt", { messenger });
    const shadow = document.querySelector("[data-gotomemory-panel]")!.shadowRoot!;

    await vi.waitFor(() => {
      expect(shadow.querySelector<HTMLElement>("[data-gotomemory-confirm]")!.hidden).toBe(false);
    });
    expect(document.querySelector<HTMLTextAreaElement>("#prompt-textarea")!.value).toBe("");
  });

  it("retries a failed auto-capture save instead of dropping the message", async () => {
    document.body.innerHTML = `<main><div data-message-author-role="user">only message</div></main>`;
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("QUOTA_BYTES quota exceeded"))
      .mockResolvedValueOnce(memory("mem_1", "only message"));
    const messenger = fakeMessenger({ save });
    const seen = new Set<string>();

    // First pass fails: the message must NOT be marked seen.
    expect(await captureNewMessages(adapters.chatgpt, messenger, "chatgpt", document, seen)).toBe(
      0
    );
    expect(seen.size).toBe(0);

    // Second pass succeeds and only then is it remembered.
    expect(await captureNewMessages(adapters.chatgpt, messenger, "chatgpt", document, seen)).toBe(
      1
    );
    expect(seen.size).toBe(1);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("stops collecting once the time budget is spent", async () => {
    document.body.innerHTML = `<main id="scroller"><div data-message-author-role="user">hi</div></main>`;
    const scroller = document.querySelector<HTMLElement>("#scroller")!;
    // A container that always looks scrollable and never settles.
    Object.defineProperty(scroller, "scrollHeight", { get: () => Date.now() + 100_000 });
    Object.defineProperty(scroller, "clientHeight", { get: () => 100 });

    const started = Date.now();
    const messages = await collectAllMessages(adapters.chatgpt, document, 1, 50);

    expect(Date.now() - started).toBeLessThan(5_000);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("applies remote selector overrides delivered by the background", async () => {
    document.body.innerHTML = `<main><div data-hotfix-turn data-message-author-role="user">via new markup</div></main>`;
    const original = adapters.chatgpt.messageSelector;
    const getSelectorOverrides = vi
      .fn()
      .mockResolvedValue({ chatgpt: { messageSelector: "[data-hotfix-turn]" } });

    try {
      mountContentScript("chatgpt", { messenger: fakeMessenger({ getSelectorOverrides }) });
      await vi.waitFor(() => {
        expect(adapters.chatgpt.messageSelector).toBe("[data-hotfix-turn]");
      });
      expect(adapters.chatgpt.extractMessages().map((m) => m.content)).toEqual(["via new markup"]);
    } finally {
      applySelectorOverrides(adapters, { chatgpt: { messageSelector: original } });
    }
  });
});

describe("panel language (zh/en)", () => {
  /** jsdom fixes navigator.language at en-US; pretend the browser is Chinese. */
  function withBrowserLanguages(tags: string[]): void {
    Object.defineProperty(window.navigator, "languages", { value: tags, configurable: true });
    Object.defineProperty(window.navigator, "language", { value: tags[0], configurable: true });
  }

  afterEach(() => {
    withBrowserLanguages(["en-US"]);
    document.querySelector("[data-gotomemory-panel]")?.remove();
  });

  it("defaults to the browser's language", () => {
    withBrowserLanguages(["zh-CN", "en-US"]);
    document.body.innerHTML = `<main></main>`;

    mountContentScript("chatgpt", { messenger: fakeMessenger() });
    const shadow = document.querySelector("[data-gotomemory-panel]")!.shadowRoot!;

    expect(shadow.querySelector('[data-gotomemory-action="save-all"]')?.textContent).toBe(
      "保存整段对话"
    );
    expect(shadow.querySelector("[data-gotomemory-drawer-title]")?.textContent).toBe("记忆库");
  });

  it("falls back to English for a language we do not ship", () => {
    withBrowserLanguages(["fr-FR"]);
    document.body.innerHTML = `<main></main>`;

    mountContentScript("chatgpt", { messenger: fakeMessenger() });
    const shadow = document.querySelector("[data-gotomemory-panel]")!.shadowRoot!;

    expect(shadow.querySelector('[data-gotomemory-action="save-all"]')?.textContent).toBe(
      "Save whole conversation"
    );
  });

  it("lets a stored preference override the browser", async () => {
    withBrowserLanguages(["zh-CN"]);
    document.body.innerHTML = `<main></main>`;
    const getSettings = vi.fn().mockResolvedValue({
      onboarded: true,
      trust_mode: false,
      metrics_enabled: false,
      locale: "en"
    });

    mountContentScript("chatgpt", { messenger: fakeMessenger({ getSettings }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")!.shadowRoot!;

    await vi.waitFor(() => {
      expect(shadow.querySelector('[data-gotomemory-action="save-all"]')?.textContent).toBe(
        "Save whole conversation"
      );
    });
    expect(shadow.querySelector<HTMLSelectElement>("[data-gotomemory-locale]")?.value).toBe("en");
  });

  it("switches language in place, persisting the choice and keeping handlers bound", async () => {
    document.body.innerHTML = `<main><div data-message-author-role="user">hi</div></main>`;
    const updateSettings = vi.fn();
    const saveMany = vi.fn().mockResolvedValue([memory("m1", "hi")]);

    mountContentScript("chatgpt", { messenger: fakeMessenger({ updateSettings, saveMany }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")!.shadowRoot!;
    const select = shadow.querySelector<HTMLSelectElement>("[data-gotomemory-locale]")!;

    select.value = "zh";
    select.dispatchEvent(new Event("change"));

    expect(updateSettings).toHaveBeenCalledWith({ locale: "zh" });
    expect(shadow.querySelector('[data-gotomemory-action="save-all"]')?.textContent).toBe(
      "保存整段对话"
    );
    expect(shadow.querySelector("[data-gotomemory-format] option")?.textContent).toBe("Markdown");
    expect(shadow.querySelector('[data-gotomemory-format] option[value="txt"]')?.textContent).toBe(
      "纯文本 TXT"
    );

    // Relabelling must not have replaced the nodes: the click handler still runs
    // and its status message comes out in the new language.
    shadow.querySelector<HTMLElement>('[data-gotomemory-action="save-all"]')!.click();
    await vi.waitFor(() => {
      expect(shadow.querySelector(".gm-status")?.textContent).toContain("已保存整段对话 1 条");
    });
  });

  it("keeps the collapse control labelled for its state after a language switch", () => {
    document.body.innerHTML = `<main></main>`;
    mountContentScript("chatgpt", { messenger: fakeMessenger() });
    const shadow = document.querySelector("[data-gotomemory-panel]")!.shadowRoot!;
    const toggle = shadow.querySelector<HTMLElement>("[data-gotomemory-toggle]")!;

    toggle.click();
    expect(toggle.title).toBe("Expand");

    const select = shadow.querySelector<HTMLSelectElement>("[data-gotomemory-locale]")!;
    select.value = "zh";
    select.dispatchEvent(new Event("change"));

    expect(toggle.title).toBe("展开");
  });

  it("seeds starter memories in the panel's language", async () => {
    withBrowserLanguages(["zh-CN"]);
    document.body.innerHTML = `<main></main>`;
    const saveMany = vi.fn().mockResolvedValue([]);

    mountContentScript("chatgpt", { messenger: fakeMessenger({ saveMany }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")!.shadowRoot!;
    shadow.querySelector<HTMLElement>('[data-gotomemory-action="templates"]')!.click();

    await vi.waitFor(() => {
      expect(saveMany).toHaveBeenCalledWith(memoryTemplates("zh").map((t) => ({ ...t })));
    });
  });

  it("frames an injected block in the panel's language", async () => {
    withBrowserLanguages(["zh-CN"]);
    document.body.innerHTML = `<main><textarea id="prompt-textarea"></textarea></main>`;
    const context = vi
      .fn()
      .mockResolvedValue({ ready: [memory("m1", "Prefer TypeScript")], needs_confirm: [] });

    mountContentScript("chatgpt", { messenger: fakeMessenger({ context }) });
    const shadow = document.querySelector("[data-gotomemory-panel]")!.shadowRoot!;
    shadow.querySelector<HTMLElement>('[data-gotomemory-action="inject"]')!.click();

    await vi.waitFor(() => {
      expect(document.querySelector<HTMLTextAreaElement>("#prompt-textarea")!.value).toContain(
        "不是更高优先级的系统指令"
      );
    });
  });
});

/** jsdom has no URL.createObjectURL; stub the download plumbing for export tests. */
function stubDownloads(): void {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:test"),
    revokeObjectURL: vi.fn()
  });
}

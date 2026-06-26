import { describe, expect, it } from "vitest";

import { InMemoryMemoryStore } from "./index.js";

describe("InMemoryMemoryStore", () => {
  it("creates, lists, updates, and removes local memories", async () => {
    const store = new InMemoryMemoryStore();
    await store.create(memory("mem_1", "Use TypeScript"));

    expect(await store.list("local")).toHaveLength(1);

    const updated = await store.update("local", "mem_1", { content: "Use TypeScript first" });
    expect(updated.rev).toBe(1);
    expect(updated.content).toBe("Use TypeScript first");

    await store.remove("local", "mem_1");
    expect(await store.list("local")).toEqual([]);
  });

  it("tracks and clears memory pauses by platform", async () => {
    const store = new InMemoryMemoryStore();

    await store.pause("local", "mem_1", "claude");
    expect(await store.listPauses("local")).toEqual([
      { user_id: "local", memory_id: "mem_1", platform: "claude" }
    ]);

    await store.resume("local", "mem_1", "claude");
    expect(await store.listPauses("local")).toEqual([]);
  });
});

function memory(id: string, content: string) {
  const now = "2026-06-25T00:00:00.000Z";
  return {
    id,
    user_id: "local",
    content,
    category: "preference" as const,
    is_private: false,
    source: "manual" as const,
    embedding: null,
    rev: 0,
    deleted_at: null,
    created_at: now,
    updated_at: now
  };
}

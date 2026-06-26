import { describe, expect, it } from "vitest";

import {
  ChromeStorageDriver,
  MemoryJsonStorageDriver,
  PersistentJsonMemoryStore
} from "./persistent.js";

describe("persistent memory stores", () => {
  it("persists memories through an injected JSON driver", async () => {
    const driver = new MemoryJsonStorageDriver();
    const store = new PersistentJsonMemoryStore(driver);

    await store.create(memory("mem_1", "Use TypeScript"));

    const reloaded = new PersistentJsonMemoryStore(driver);
    expect((await reloaded.list("local")).map((item) => item.content)).toEqual(["Use TypeScript"]);
  });

  it("persists pause state and clears it when memory is removed", async () => {
    const store = new PersistentJsonMemoryStore(new MemoryJsonStorageDriver());

    await store.create(memory("mem_1", "Use TypeScript"));
    await store.pause("local", "mem_1", "claude");
    expect(await store.listPauses("local")).toHaveLength(1);

    await store.remove("local", "mem_1");
    expect(await store.listPauses("local")).toEqual([]);
  });

  it("adapts chrome.storage.local shape without binding core logic to chrome globals", async () => {
    const backing: Record<string, unknown> = {};
    const driver = new ChromeStorageDriver({
      async get(key) {
        return typeof key === "string" ? { [key]: backing[key] } : backing;
      },
      async set(items) {
        Object.assign(backing, items);
      }
    });
    const store = new PersistentJsonMemoryStore(driver);

    await store.create(memory("mem_1", "Stored in chrome.storage"));

    expect((await store.list("local"))[0]?.content).toBe("Stored in chrome.storage");
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

import { describe, expect, it } from "vitest";

import { ChromeStorageDriver } from "./extension/index.js";
import { MemoryJsonStorageDriver, PersistentJsonMemoryStore } from "./persistent.js";

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

  it("createMany writes the whole batch as a single blob write", async () => {
    const driver = new MemoryJsonStorageDriver();
    let writes = 0;
    const counting = {
      read: () => driver.read(),
      write: (state: Parameters<MemoryJsonStorageDriver["write"]>[0]) => {
        writes += 1;
        return driver.write(state);
      }
    };
    const store = new PersistentJsonMemoryStore(counting);

    const created = await store.createMany([
      memory("mem_1", "first"),
      memory("mem_2", "second"),
      memory("mem_3", "third")
    ]);

    expect(created).toHaveLength(3);
    expect(writes).toBe(1);
    expect((await store.list("local")).map((item) => item.id).sort()).toEqual([
      "mem_1",
      "mem_2",
      "mem_3"
    ]);

    // Empty batches touch storage not at all.
    expect(await store.createMany([])).toEqual([]);
    expect(writes).toBe(1);
  });

  it("serializes concurrent writes instead of losing all but the last one", async () => {
    // Every mutation is read-blob → mutate → write-blob. Without serialization
    // three overlapping creates all read the same empty state and the last
    // write wins, silently dropping two memories — reachable whenever two
    // assistant tabs (or auto-capture and a manual save) act at once.
    const store = new PersistentJsonMemoryStore(slowDriver());

    await Promise.all([
      store.create(memory("mem_1", "first")),
      store.create(memory("mem_2", "second")),
      store.create(memory("mem_3", "third"))
    ]);

    expect((await store.list("local")).map((item) => item.id).sort()).toEqual([
      "mem_1",
      "mem_2",
      "mem_3"
    ]);
  });

  it("keeps serving transactions after one of them throws", async () => {
    const store = new PersistentJsonMemoryStore(slowDriver());
    await store.create(memory("mem_1", "first"));

    await expect(store.update("local", "missing", { content: "x" })).rejects.toThrow(
      "memory not found"
    );

    await store.create(memory("mem_2", "second"));
    expect((await store.list("local")).map((item) => item.id).sort()).toEqual(["mem_1", "mem_2"]);
  });

  it("scopes conversation dedup lookups to the requested conversations", async () => {
    const store = new PersistentJsonMemoryStore(new MemoryJsonStorageDriver());
    await store.createMany([
      { ...memory("mem_1", "in a"), conversation_id: "conv_a" },
      { ...memory("mem_2", "in b"), conversation_id: "conv_b" },
      memory("mem_3", "loose")
    ]);

    expect((await store.listByConversation("local", ["conv_a"])).map((item) => item.id)).toEqual([
      "mem_1"
    ]);
    expect(await store.listByConversation("local", [])).toEqual([]);
  });

  it("removeMany deletes a whole conversation in a single blob write", async () => {
    const driver = new MemoryJsonStorageDriver();
    let writes = 0;
    const store = new PersistentJsonMemoryStore({
      read: () => driver.read(),
      write: (state) => {
        writes += 1;
        return driver.write(state);
      }
    });

    await store.createMany([memory("mem_1", "a"), memory("mem_2", "b"), memory("mem_3", "c")]);
    await store.pause("local", "mem_1", "claude");
    writes = 0;

    await store.removeMany("local", ["mem_1", "mem_2"]);

    expect(writes).toBe(1);
    expect((await store.list("local")).map((item) => item.id)).toEqual(["mem_3"]);
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

/** A driver whose reads and writes both yield, widening the interleaving window. */
function slowDriver(): MemoryJsonStorageDriver {
  const inner = new MemoryJsonStorageDriver();
  return {
    async read() {
      await tick();
      return inner.read();
    },
    async write(state) {
      await tick();
      return inner.write(state);
    }
  } as MemoryJsonStorageDriver;
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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

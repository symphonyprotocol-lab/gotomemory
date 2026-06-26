import { describe, expect, it } from "vitest";

import {
  InMemoryShareRepository,
  MemoryObjectStorage,
  ObjectBackedShareRepository,
  PostgresShareRepository
} from "./repository.js";

describe("share repositories", () => {
  it("externalizes large messages into object storage and hydrates them on read", async () => {
    const base = new InMemoryShareRepository();
    const objects = new MemoryObjectStorage();
    const repo = new ObjectBackedShareRepository(base, objects, 10);

    await repo.create(record("large content that should move"));

    expect([...objects.objects.keys()]).toEqual(["shares/local/sc_1/messages.json"]);
    expect((await repo.getById("sc_1"))?.messages[0]?.content).toBe(
      "large content that should move"
    );
  });

  it("keeps small messages inline", async () => {
    const base = new InMemoryShareRepository();
    const objects = new MemoryObjectStorage();
    const repo = new ObjectBackedShareRepository(base, objects, 1000);

    await repo.create(record("small"));

    expect(objects.objects.size).toBe(0);
    expect((await repo.findBySlug("abcdefghijklmnopqrstuv"))?.messages[0]?.content).toBe("small");
  });

  it("emits parameterized SQL for the Postgres adapter", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const repo = new PostgresShareRepository({
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [] };
      }
    });

    await repo.create(record("stored"));

    expect(calls[0]?.sql).toContain("insert into shared_conversations");
    expect(calls[0]?.params?.[0]).toBe("sc_1");
  });
});

function record(content: string) {
  return {
    id: "sc_1",
    user_id: "local",
    slug: "abcdefghijklmnopqrstuv",
    title: "Demo",
    messages: [{ role: "user" as const, content }],
    visibility: "public" as const,
    status: "active" as const,
    expires_at: null,
    view_count: 0,
    created_at: "2026-06-25T00:00:00.000Z"
  };
}

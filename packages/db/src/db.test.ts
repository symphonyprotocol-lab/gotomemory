import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryMemoryRepository } from "./in-memory.js";
import { NotFoundError, VersionConflictError } from "./repository.js";
import type { MemoryRecord } from "./types.js";

function record(over: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "m1",
    tenantId: "t1",
    ownerId: "u1",
    collectionId: null,
    scope: "personal",
    type: "preference",
    contentEncrypted: "enc",
    summaryEncrypted: "enc",
    summaryPreview: "prefers typescript code examples",
    summarySensitivity: "normal",
    subject: null,
    predicate: null,
    value: null,
    tags: ["coding", "typescript"],
    source: "user_explicit",
    confidence: 0.9,
    sensitivity: "normal",
    embeddingPolicy: "allowed",
    freshness: "timeless",
    status: "active",
    validFrom: null,
    validTo: null,
    supersededBy: null,
    ttl: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    lastUsedAt: null,
    lastObservedAt: null,
    encryptionKeyId: "master-1",
    version: 1,
    ...over,
  };
}

describe("InMemoryMemoryRepository", () => {
  let repo: InMemoryMemoryRepository;
  beforeEach(() => {
    repo = new InMemoryMemoryRepository();
  });

  it("inserts and reads back by id, tenant-scoped", async () => {
    await repo.insert(record());
    expect((await repo.getById("t1", "m1"))?.tags).toEqual(["coding", "typescript"]);
    expect(await repo.getById("other-tenant", "m1")).toBeNull();
  });

  it("enforces optimistic version on update", async () => {
    await repo.insert(record());
    const updated = await repo.update(record({ summaryPreview: "v2" }), 1);
    expect(updated.version).toBe(2);
    await expect(repo.update(record(), 1)).rejects.toBeInstanceOf(VersionConflictError);
  });

  it("throws NotFoundError updating a missing record", async () => {
    await expect(repo.update(record(), 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("soft delete removes from active search", async () => {
    await repo.insert(record());
    expect(await repo.softDelete("t1", "m1")).toBe(true);
    const hits = await repo.searchActive({
      tenantId: "t1",
      ownerId: "u1",
      scopes: ["personal"],
      text: "typescript",
      limit: 10,
      now: Date.now(),
    });
    expect(hits).toHaveLength(0);
  });

  it("ranks lexical overlap and respects scope + tenant", async () => {
    await repo.insert(
      record({ id: "m1", summaryPreview: "typescript preference", tags: ["typescript"] }),
    );
    await repo.insert(record({ id: "m2", summaryPreview: "python preference", tags: ["python"] }));
    const hits = await repo.searchActive({
      tenantId: "t1",
      ownerId: "u1",
      scopes: ["personal"],
      text: "typescript examples",
      limit: 10,
      now: Date.now(),
    });
    expect(hits[0]?.record.id).toBe("m1");
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it("finds the active slot for a refresh key", async () => {
    await repo.insert(
      record({
        id: "emp",
        subject: "user",
        predicate: "current_employer",
        value: "A",
        freshness: "current_state",
      }),
    );
    const slot = await repo.findActiveSlot("t1", "u1", "personal", "user", "current_employer");
    expect(slot?.id).toBe("emp");
  });

  it("excludes expired (ttl) memories from search", async () => {
    await repo.insert(record({ ttl: new Date(1000).toISOString() }));
    const hits = await repo.searchActive({
      tenantId: "t1",
      ownerId: "u1",
      scopes: ["personal"],
      text: "typescript",
      limit: 10,
      now: 2000,
    });
    expect(hits).toHaveLength(0);
  });
});

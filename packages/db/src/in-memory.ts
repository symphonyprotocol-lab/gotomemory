import { type MemoryRepository, NotFoundError, VersionConflictError } from "./repository.js";
import type { MemoryRecord, ScoredMemory, Scope, SearchQuery } from "./types.js";

function clone(record: MemoryRecord): MemoryRecord {
  return { ...record, tags: [...record.tags] };
}

function isExpired(record: MemoryRecord, now: number): boolean {
  return record.ttl != null && Date.parse(record.ttl) <= now;
}

const STOPWORDS = new Set(["the", "a", "an", "to", "of", "for", "and", "my", "me", "i"]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Naive lexical overlap used by the dev backend in place of vector search. */
function score(query: string, record: MemoryRecord): number {
  const haystack = tokenize(
    [
      record.summaryPreview ?? "",
      record.tags.join(" "),
      record.subject ?? "",
      record.value ?? "",
    ].join(" "),
  );
  if (haystack.length === 0) return 0;
  const set = new Set(haystack);
  const q = tokenize(query);
  if (q.length === 0) return 0.01; // tie-breakable baseline so non-empty queries still surface owned items
  const hits = q.filter((t) => set.has(t)).length;
  return hits / q.length;
}

/** In-memory MemoryRepository for dev and tests. Not durable, not concurrent-safe. */
export class InMemoryMemoryRepository implements MemoryRepository {
  private readonly store = new Map<string, MemoryRecord>();

  private key(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }

  insert(record: MemoryRecord): Promise<void> {
    this.store.set(this.key(record.tenantId, record.id), clone(record));
    return Promise.resolve();
  }

  getById(tenantId: string, id: string): Promise<MemoryRecord | null> {
    const found = this.store.get(this.key(tenantId, id));
    return Promise.resolve(found ? clone(found) : null);
  }

  update(record: MemoryRecord, expectedVersion: number): Promise<MemoryRecord> {
    const existing = this.store.get(this.key(record.tenantId, record.id));
    if (!existing) return Promise.reject(new NotFoundError(record.id));
    if (existing.version !== expectedVersion) {
      return Promise.reject(new VersionConflictError(expectedVersion, existing.version));
    }
    const next = { ...clone(record), version: existing.version + 1 };
    this.store.set(this.key(record.tenantId, record.id), next);
    return Promise.resolve(clone(next));
  }

  softDelete(tenantId: string, id: string): Promise<boolean> {
    const existing = this.store.get(this.key(tenantId, id));
    if (!existing) return Promise.resolve(false);
    existing.status = "deleted";
    existing.updatedAt = new Date(0).toISOString();
    return Promise.resolve(true);
  }

  searchActive(query: SearchQuery): Promise<ScoredMemory[]> {
    const scopes = new Set<Scope>(query.scopes);
    const results: ScoredMemory[] = [];
    for (const record of this.store.values()) {
      if (record.tenantId !== query.tenantId) continue;
      if (record.ownerId !== query.ownerId) continue;
      if (record.status !== "active") continue;
      if (scopes.size > 0 && !scopes.has(record.scope)) continue;
      if (isExpired(record, query.now)) continue;
      results.push({ record: clone(record), score: score(query.text, record) });
    }
    return Promise.resolve(results.sort((a, b) => b.score - a.score).slice(0, query.limit));
  }

  findActiveSlot(
    tenantId: string,
    ownerId: string,
    scope: Scope,
    subject: string,
    predicate: string,
  ): Promise<MemoryRecord | null> {
    for (const record of this.store.values()) {
      if (
        record.tenantId === tenantId &&
        record.ownerId === ownerId &&
        record.scope === scope &&
        record.subject === subject &&
        record.predicate === predicate &&
        record.status === "active"
      ) {
        return Promise.resolve(clone(record));
      }
    }
    return Promise.resolve(null);
  }
}

import type { MemoryRecord, ScoredMemory, Scope, SearchQuery } from "./types.js";

export class NotFoundError extends Error {
  constructor(id: string) {
    super(`memory not found: ${id}`);
    this.name = "NotFoundError";
  }
}

export class VersionConflictError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`version conflict: expected ${expected}, found ${actual}`);
    this.name = "VersionConflictError";
  }
}

/**
 * Storage contract for memories. The in-memory implementation backs dev/test; a
 * Postgres-backed implementation (migrations/0001_init.sql) is the production target.
 * All methods are tenant-scoped — cross-tenant access is impossible by construction.
 */
export interface MemoryRepository {
  insert(record: MemoryRecord): Promise<void>;
  getById(tenantId: string, id: string): Promise<MemoryRecord | null>;
  /** Optimistic update; throws VersionConflictError if expectedVersion is stale. */
  update(record: MemoryRecord, expectedVersion: number): Promise<MemoryRecord>;
  /** Soft delete: set status=deleted, drop from retrieval. Returns false if absent. */
  softDelete(tenantId: string, id: string): Promise<boolean>;
  /** Active, non-expired candidates ranked by a naive lexical score (dev backend). */
  searchActive(query: SearchQuery): Promise<ScoredMemory[]>;
  /** The single active memory for a refresh slot, if any (§14.2). */
  findActiveSlot(
    tenantId: string,
    ownerId: string,
    scope: Scope,
    subject: string,
    predicate: string,
  ): Promise<MemoryRecord | null>;
}

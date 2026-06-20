export type Sensitivity = "public" | "normal" | "private" | "secret";
export type Scope = "personal" | "project" | "team" | "session";
export type EmbeddingPolicy = "allowed" | "redacted_only" | "disabled";
export type Freshness = "current_state" | "historical_fact" | "timeless" | "temporary";
export type MemoryStatus = "active" | "superseded" | "expired" | "deleted" | "pending_confirmation";

/**
 * A stored memory row (mirrors the `memories` table, §8.1). Encrypted fields are opaque
 * strings here — the repository never decrypts; that is core/crypto's job. This keeps the
 * storage layer free of any key material (monorepo-guide §5.2).
 */
export interface MemoryRecord {
  id: string;
  tenantId: string;
  ownerId: string;
  collectionId: string | null;
  scope: Scope;
  type: string;
  /** Opaque, serialized EncryptedBlob (content). */
  contentEncrypted: string;
  /** Opaque, serialized EncryptedBlob (full summary). */
  summaryEncrypted: string;
  summaryPreview: string | null;
  summarySensitivity: Sensitivity;
  subject: string | null;
  predicate: string | null;
  value: string | null;
  tags: string[];
  source: string;
  confidence: number;
  sensitivity: Sensitivity;
  embeddingPolicy: EmbeddingPolicy;
  freshness: Freshness;
  status: MemoryStatus;
  validFrom: string | null;
  validTo: string | null;
  supersededBy: string | null;
  ttl: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  lastObservedAt: string | null;
  encryptionKeyId: string;
  version: number;
}

export interface SearchQuery {
  tenantId: string;
  ownerId: string;
  scopes: Scope[];
  text: string;
  limit: number;
  now: number;
}

export interface ScoredMemory {
  record: MemoryRecord;
  score: number;
}

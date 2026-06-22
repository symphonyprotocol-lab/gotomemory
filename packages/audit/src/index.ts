import { createHash } from "node:crypto";

export type AuditEventType =
  | "memory.created"
  | "memory.updated"
  | "memory.deleted"
  | "memory.superseded"
  | "memory.retrieved"
  | "memory.injected"
  | "memory.redacted"
  | "policy.changed"
  | "export.created";

export type ContentAccessLevel = "none" | "preview" | "summary" | "full";

/**
 * An audit event. By construction it carries no memory bodies, full summaries, or raw
 * embeddings — only ids and decision metadata (system spec §7.6, §18).
 */
export interface AuditEvent {
  tenantId: string;
  eventType: AuditEventType;
  actorId: string;
  clientId?: string;
  platform?: string;
  memoryIds: string[];
  purpose?: string;
  decisionId?: string;
  decision?: string;
  redactionApplied?: boolean;
  contentAccessLevel?: ContentAccessLevel;
}

export interface StoredAuditEvent extends AuditEvent {
  rowHash: string;
  prevHash: string | null;
  at: number;
}

export interface AuditSink {
  record(event: AuditEvent, at: number): Promise<void>;
}

function hashEvent(event: AuditEvent, prevHash: string | null, at: number): string {
  // Every integrity-relevant field is folded into the chain so tampering with any of them
  // (not just ids/decision) breaks verify() (§7.6, §18).
  const canonical = JSON.stringify({
    prevHash,
    at,
    t: event.tenantId,
    e: event.eventType,
    a: event.actorId,
    cl: event.clientId ?? null,
    p: event.platform ?? null,
    m: event.memoryIds,
    pu: event.purpose ?? null,
    d: event.decisionId ?? null,
    de: event.decision ?? null,
    r: event.redactionApplied ?? null,
    c: event.contentAccessLevel ?? "none",
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * In-memory append-only sink with a per-tenant hash chain. Backs dev/test; the durable
 * target is the `audit_events` table. Tampering is detectable via {@link verify}.
 */
export class InMemoryAuditSink implements AuditSink {
  private readonly events: StoredAuditEvent[] = [];
  private readonly lastHashByTenant = new Map<string, string>();

  record(event: AuditEvent, at: number): Promise<void> {
    const prevHash = this.lastHashByTenant.get(event.tenantId) ?? null;
    const rowHash = hashEvent(event, prevHash, at);
    this.events.push({ ...event, memoryIds: [...event.memoryIds], rowHash, prevHash, at });
    this.lastHashByTenant.set(event.tenantId, rowHash);
    return Promise.resolve();
  }

  list(tenantId?: string): StoredAuditEvent[] {
    return this.events.filter((e) => tenantId == null || e.tenantId === tenantId);
  }

  /** Recompute the chain and confirm no event was altered or removed. */
  verify(tenantId: string): boolean {
    let prev: string | null = null;
    for (const e of this.list(tenantId)) {
      if (e.prevHash !== prev) return false;
      if (hashEvent(e, prev, e.at) !== e.rowHash) return false;
      prev = e.rowHash;
    }
    return true;
  }
}

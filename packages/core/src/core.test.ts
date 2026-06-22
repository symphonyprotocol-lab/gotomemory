import { InMemoryAuditSink } from "@gotomemory/audit";
import { EnvelopeCipher } from "@gotomemory/crypto";
import { InMemoryMemoryRepository } from "@gotomemory/db";
import { beforeEach, describe, expect, it } from "vitest";
import { type RequestContext } from "./context.js";
import { MemoryService } from "./service.js";

const ctx: RequestContext = {
  tenantId: "t1",
  subjectId: "u1",
  ownerId: "u1",
  clientId: "cli",
  platform: "claude",
};

function makeService() {
  let counter = 0;
  const audit = new InMemoryAuditSink();
  const repo = new InMemoryMemoryRepository();
  const service = new MemoryService({
    repo,
    audit,
    cipher: new EnvelopeCipher(EnvelopeCipher.generateMasterKey()),
    clock: () => 1_700_000_000_000,
    ids: () => `id${++counter}`,
  });
  return { service, audit, repo };
}

describe("MemoryService", () => {
  let service: MemoryService;
  let audit: InMemoryAuditSink;
  beforeEach(() => {
    ({ service, audit } = makeService());
  });

  it("creates a normal memory and finds it without leaking content", async () => {
    await service.createMemory(ctx, {
      scope: "personal",
      type: "preference",
      content: "用户希望代码示例优先使用 TypeScript",
      source: "user_explicit",
      tags: ["typescript"],
    });
    const res = await service.searchMemories(ctx, { query: "typescript", platform: "claude" });
    expect(res.items).toHaveLength(1);
    const item = res.items[0]!;
    expect(item.access.can_inject).toBe(true);
    expect(item).not.toHaveProperty("content"); // structural: search items carry no content
    expect(item.summary_preview.length).toBeGreaterThan(0);
    expect(res.decision_id).toMatch(/^dec_/);
  });

  it("read returns full content after policy + writes a full-access audit event", async () => {
    const created = await service.createMemory(ctx, {
      scope: "personal",
      type: "fact",
      content: "项目使用 pnpm + turborepo",
      source: "user_explicit",
    });
    const read = await service.readMemory(ctx, created.id, "debugging");
    expect(read.content).toBe("项目使用 pnpm + turborepo");
    expect(
      audit
        .list("t1")
        .some((e) => e.eventType === "memory.retrieved" && e.contentAccessLevel === "full"),
    ).toBe(true);
  });

  it("auto-injects normal memories in context/build", async () => {
    await service.createMemory(ctx, {
      scope: "personal",
      type: "preference",
      content: "喜欢中文技术文档",
      source: "user_explicit",
      tags: ["docs"],
    });
    const res = await service.buildContext(ctx, {
      platform: "claude",
      client_id: "cli",
      task: "写 docs",
      token_budget: 1200,
    });
    expect(res.memory_ids).toHaveLength(1);
    expect(res.context).toContain("中文技术文档");
    expect(res.requires_confirmation).toBe(false);
  });

  it("private memory requires confirmation, then confirm injects it", async () => {
    await service.createMemory(ctx, {
      scope: "personal",
      type: "fact",
      content: "我在某公司负责内部支付系统",
      source: "user_explicit",
      sensitivity: "private",
      tags: ["payments"],
    });
    const build = await service.buildContext(ctx, {
      platform: "claude",
      client_id: "cli",
      task: "支付系统",
    });
    expect(build.requires_confirmation).toBe(true);
    expect(build.context).toBeNull();
    expect(build.omitted[0]?.reason).toBe("requires_confirmation");
    const token = build.confirmation!.confirmation_token;
    const memId = build.confirmation!.preview![0]!.id;

    const confirmed = await service.confirmContext(ctx, {
      decision_id: build.decision_id,
      confirmation_token: token,
      confirmed_memory_ids: [memId],
    });
    expect(confirmed.memory_ids).toEqual([memId]);
    expect(confirmed.context).toContain("支付系统");
    // token is one-time
    await expect(
      service.confirmContext(ctx, {
        decision_id: build.decision_id,
        confirmation_token: token,
        confirmed_memory_ids: [memId],
      }),
    ).rejects.toThrow();
  });

  it("secret memory is omitted from build and search by default (§19.1)", async () => {
    await service.createMemory(ctx, {
      scope: "personal",
      type: "credential_hint",
      content: "prod db password hint: see vault",
      source: "user_explicit",
    });
    const build = await service.buildContext(ctx, {
      platform: "claude",
      client_id: "cli",
      task: "db",
    });
    expect(build.memory_ids).toHaveLength(0);
    expect(build.omitted.some((o) => o.reason === "sensitivity_exceeds_policy")).toBe(true);
    const search = await service.searchMemories(ctx, { query: "db", platform: "claude" });
    expect(search.items).toHaveLength(0); // secret denied for read+inject -> not surfaced
  });

  it("refreshes a current-state slot, superseding the old value", async () => {
    await service.createMemory(ctx, {
      scope: "personal",
      type: "fact",
      content: "我在 A 公司工作",
      source: "user_explicit",
      subject: "user",
      predicate: "current_employer",
      value: "A 公司",
      freshness: "current_state",
    });
    await service.createMemory(ctx, {
      scope: "personal",
      type: "fact",
      content: "我现在在 B 公司工作",
      source: "user_explicit",
      subject: "user",
      predicate: "current_employer",
      value: "B 公司",
      freshness: "current_state",
    });
    const search = await service.searchMemories(ctx, { query: "公司", platform: "claude" });
    expect(search.items).toHaveLength(1); // only the active (B) remains
    expect(audit.list("t1").some((e) => e.eventType === "memory.superseded")).toBe(true);
  });

  it("update cannot downgrade a detected secret below its classified floor", async () => {
    const created = await service.createMemory(ctx, {
      scope: "personal",
      type: "credential_hint",
      content: "vault path: secret/db",
      source: "user_explicit",
    });
    expect(created.sensitivity).toBe("secret");
    const updated = await service.updateMemory(ctx, created.id, {
      sensitivity: "public",
      version: created.version,
    });
    // credential_hint forces secret on re-classification regardless of the submitted value
    expect(updated.sensitivity).toBe("secret");
  });

  it("update to secret nulls the preview and drops it from default search", async () => {
    const created = await service.createMemory(ctx, {
      scope: "personal",
      type: "note",
      content: "team standup is at 10am",
      source: "user_explicit",
      tags: ["schedule"],
    });
    const before = await service.searchMemories(ctx, { query: "standup", platform: "claude" });
    expect(before.items).toHaveLength(1);

    await service.updateMemory(ctx, created.id, {
      sensitivity: "secret",
      version: created.version,
    });
    const after = await service.searchMemories(ctx, { query: "standup", platform: "claude" });
    expect(after.items).toHaveLength(0); // secret exceeds the default read+inject ceiling
  });

  it("denies create when no policy allows it", async () => {
    const denying = new MemoryService({
      repo: new InMemoryMemoryRepository(),
      audit: new InMemoryAuditSink(),
      cipher: new EnvelopeCipher(EnvelopeCipher.generateMasterKey()),
      policies: () => [],
    });
    await expect(
      denying.createMemory(ctx, {
        scope: "personal",
        type: "note",
        content: "x",
        source: "manual",
      }),
    ).rejects.toThrow(/policy denied/);
  });
});

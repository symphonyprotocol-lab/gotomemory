import { describe, expect, it } from "vitest";
import { InMemoryAuditSink } from "./index.js";

describe("InMemoryAuditSink", () => {
  it("records events and links them in a hash chain", async () => {
    const sink = new InMemoryAuditSink();
    await sink.record(
      { tenantId: "t1", eventType: "memory.created", actorId: "u1", memoryIds: ["m1"] },
      1,
    );
    await sink.record(
      {
        tenantId: "t1",
        eventType: "memory.injected",
        actorId: "u1",
        memoryIds: ["m1"],
        decisionId: "d1",
      },
      2,
    );
    const events = sink.list("t1");
    expect(events).toHaveLength(2);
    expect(events[0]?.prevHash).toBeNull();
    expect(events[1]?.prevHash).toBe(events[0]?.rowHash);
    expect(sink.verify("t1")).toBe(true);
  });

  it("detects tampering", async () => {
    const sink = new InMemoryAuditSink();
    await sink.record(
      { tenantId: "t1", eventType: "memory.created", actorId: "u1", memoryIds: ["m1"] },
      1,
    );
    // Mutate a recorded event out from under the chain.
    sink.list("t1")[0]!.memoryIds.push("evil");
    expect(sink.verify("t1")).toBe(false);
  });

  it("keeps separate chains per tenant", async () => {
    const sink = new InMemoryAuditSink();
    await sink.record(
      { tenantId: "t1", eventType: "memory.created", actorId: "u1", memoryIds: [] },
      1,
    );
    await sink.record(
      { tenantId: "t2", eventType: "memory.created", actorId: "u2", memoryIds: [] },
      1,
    );
    expect(sink.list("t1")[0]?.prevHash).toBeNull();
    expect(sink.list("t2")[0]?.prevHash).toBeNull();
    expect(sink.verify("t1")).toBe(true);
    expect(sink.verify("t2")).toBe(true);
  });
});

import type { GotomemoryClient } from "@gotomemory/sdk";
import { describe, expect, it, vi } from "vitest";
import { buildContext, saveMemory, searchMemory } from "./handlers.js";

function fakeClient(
  overrides: Partial<GotomemoryClient["memories"] & GotomemoryClient["context"]> = {},
) {
  return {
    memories: {
      create: vi.fn().mockResolvedValue({ id: "m1", status: "active", version: 1 }),
      search: vi
        .fn()
        .mockResolvedValue({ items: [{ id: "m1" }], next_cursor: null, decision_id: "dec_1" }),
      read: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      ...overrides,
    },
    context: {
      build: vi.fn().mockResolvedValue({ memory_ids: ["m1"], decision_id: "dec_2", omitted: [] }),
      confirm: vi.fn(),
    },
  } as unknown as GotomemoryClient;
}

describe("mcp tool handlers", () => {
  it("search routes through the SDK and returns JSON text", async () => {
    const client = fakeClient();
    const out = await searchMemory(client, { query: "ts", limit: 5 });
    expect(client.memories.search).toHaveBeenCalledWith({
      query: "ts",
      scope: undefined,
      limit: 5,
    });
    expect(JSON.parse(out).decision_id).toBe("dec_1");
  });

  it("save defaults scope and source", async () => {
    const client = fakeClient();
    await saveMemory(client, { content: "x", type: "preference" });
    expect(client.memories.create).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "personal", source: "api", type: "preference" }),
    );
  });

  it("build_context tags the client as mcp-server", async () => {
    const client = fakeClient();
    await buildContext(client, { task: "do" });
    expect(client.context.build).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "mcp-server", platform: "claude" }),
    );
  });
});

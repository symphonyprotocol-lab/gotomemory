import type { GotomemoryClient } from "@gotomemory/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  buildContext,
  buildMemoryContext,
  confirmContext,
  saveConversationSummary,
  saveMemory,
  searchMemory,
  shareGeneratedPage,
  unpublishSharedPage,
} from "./handlers.js";

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
      confirm: vi.fn().mockResolvedValue({ memory_ids: ["m1"], decision_id: "dec_2", omitted: [] }),
    },
    pages: {
      create: vi.fn().mockResolvedValue({
        id: "pg_1",
        slug: "s1",
        title: "Page",
        description: null,
        kind: "html",
        url: "http://pages/p/s1",
        visibility: "unlisted",
        status: "active",
        expires_at: null,
        created_at: "2026-06-24T00:00:00.000Z",
        updated_at: "2026-06-24T00:00:00.000Z",
        version: 1,
      }),
      list: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      createVersion: vi.fn(),
      unpublish: vi.fn().mockResolvedValue(undefined),
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

  it("save_conversation_summary stores a personal note", async () => {
    const client = fakeClient();
    await saveConversationSummary(client, { topic: "mcp", summary: "Added semantic tools." });
    expect(client.memories.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "mcp: Added semantic tools.",
        scope: "personal",
        source: "api",
        type: "note",
      }),
    );
  });

  it("build_context tags the client as mcp-server", async () => {
    const client = fakeClient();
    await buildContext(client, { task: "do" });
    expect(client.context.build).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "mcp-server", platform: "claude" }),
    );
  });

  it("build_memory_context defaults to chatgpt for semantic connector use", async () => {
    const client = fakeClient();
    await buildMemoryContext(client, { task: "do" });
    expect(client.context.build).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "mcp-server", platform: "chatgpt" }),
    );
  });

  it("confirm_context redeems the selected memories through the SDK", async () => {
    const client = fakeClient();
    const out = await confirmContext(client, {
      decision_id: "dec_2",
      confirmation_token: "cnf_1",
      confirmed_memory_ids: ["m1"],
    });
    expect(client.context.confirm).toHaveBeenCalledWith({
      decision_id: "dec_2",
      confirmation_token: "cnf_1",
      confirmed_memory_ids: ["m1"],
    });
    expect(JSON.parse(out).memory_ids).toEqual(["m1"]);
  });

  it("share_generated_page publishes through the SDK", async () => {
    const client = fakeClient();
    const out = await shareGeneratedPage(client, {
      title: "Page",
      kind: "html",
      content: "<h1>x</h1>",
      expires_in: { value: 1, unit: "days" },
    });
    expect(client.pages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Page",
        kind: "html",
        content: "<h1>x</h1>",
        expires_in: { value: 1, unit: "days" },
        source: "mcp",
      }),
    );
    expect(JSON.parse(out).url).toBe("http://pages/p/s1");
  });

  it("unpublish_shared_page routes through the SDK", async () => {
    const client = fakeClient();
    const out = await unpublishSharedPage(client, { id: "pg_1" });
    expect(client.pages.unpublish).toHaveBeenCalledWith("pg_1");
    expect(JSON.parse(out).status).toBe("unpublished");
  });
});

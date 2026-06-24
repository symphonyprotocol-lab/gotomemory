import type { GotomemoryClient } from "@gotomemory/sdk";
import { describe, expect, it, vi } from "vitest";
import { buildProgram, exitCodeFor } from "./cli.js";

describe("exitCodeFor", () => {
  it("maps each error code to its stable exit code", () => {
    expect(exitCodeFor("invalid_request")).toBe(2);
    expect(exitCodeFor("unauthenticated")).toBe(3);
    expect(exitCodeFor("policy_denied")).toBe(4);
    expect(exitCodeFor("not_found")).toBe(5);
    expect(exitCodeFor("version_conflict")).toBe(6);
    expect(exitCodeFor("rate_limited")).toBe(7);
  });

  it("falls back to 1 for unknown codes", () => {
    expect(exitCodeFor("internal")).toBe(1);
    expect(exitCodeFor("something-else")).toBe(1);
  });
});

describe("pages commands", () => {
  it("publishes a page with an hour-based expiration", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "pg_1",
      slug: "s1",
      title: "Page",
      description: null,
      kind: "html",
      url: "http://pages/p/s1",
      visibility: "unlisted",
      status: "active",
      expires_at: "2026-06-24T02:00:00.000Z",
      created_at: "2026-06-24T00:00:00.000Z",
      updated_at: "2026-06-24T00:00:00.000Z",
      version: 1,
    });
    const client = {
      memories: {},
      context: {},
      pages: {
        create,
      },
    } as unknown as GotomemoryClient;
    const program = buildProgram(() => client);
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "gotomemory",
      "--json",
      "pages",
      "publish",
      "--title",
      "Page",
      "--kind",
      "html",
      "--content",
      "<h1>x</h1>",
      "--expires",
      "2h",
    ]);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Page",
        kind: "html",
        content: "<h1>x</h1>",
        expires_in: { value: 2, unit: "hours" },
        source: "cli",
      }),
    );
    expect(write).toHaveBeenCalled();
    write.mockRestore();
  });
});

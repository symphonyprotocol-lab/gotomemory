import { InMemoryAuditSink } from "@gotomemory/audit";
import { MemoryService } from "@gotomemory/core";
import { EnvelopeCipher } from "@gotomemory/crypto";
import { InMemoryMemoryRepository } from "@gotomemory/db";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

const AUTH = { authorization: "Bearer t1:u1" };

describe("gateway", () => {
  let app: FastifyInstance;
  beforeEach(() => {
    app = buildServer({
      service: new MemoryService({
        repo: new InMemoryMemoryRepository(),
        audit: new InMemoryAuditSink(),
        cipher: new EnvelopeCipher(EnvelopeCipher.generateMasterKey()),
      }),
    });
  });
  afterEach(async () => {
    await app.close();
  });

  it("rejects unauthenticated requests", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/memories", payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("unauthenticated");
  });

  it("runs create -> search -> read -> delete", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: AUTH,
      payload: {
        scope: "personal",
        type: "preference",
        content: "prefers vitest",
        source: "user_explicit",
        tags: ["test"],
      },
    });
    expect(create.statusCode).toBe(201);
    const id = create.json().id as string;

    const search = await app.inject({
      method: "POST",
      url: "/v1/memories/search",
      headers: AUTH,
      payload: { query: "vitest", platform: "claude" },
    });
    expect(search.statusCode).toBe(200);
    expect(search.json().items).toHaveLength(1);
    expect(search.json().items[0]).not.toHaveProperty("content");

    const read = await app.inject({
      method: "GET",
      url: `/v1/memories/${id}?purpose=debug`,
      headers: AUTH,
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().content).toBe("prefers vitest");
    expect(read.headers.etag).toBe("1");

    const del = await app.inject({ method: "DELETE", url: `/v1/memories/${id}`, headers: AUTH });
    expect(del.statusCode).toBe(204);
  });

  it("requires purpose on read", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/memories/x", headers: AUTH });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_request");
  });

  it("builds context for a normal memory", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: AUTH,
      payload: {
        scope: "personal",
        type: "preference",
        content: "likes chinese docs",
        source: "user_explicit",
        tags: ["docs"],
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/context/build",
      headers: AUTH,
      payload: { platform: "claude", client_id: "test", task: "docs" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().memory_ids).toHaveLength(1);
    expect(res.json().decision_id).toMatch(/^dec_/);
  });
});

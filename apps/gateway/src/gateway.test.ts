import { InMemoryAuditSink } from "@gotomemory/audit";
import { MemoryService } from "@gotomemory/core";
import { EnvelopeCipher } from "@gotomemory/crypto";
import { InMemoryAuthRepository, InMemoryMemoryRepository } from "@gotomemory/db";
import { InMemoryPageRepository, InMemoryPageStorage, PageService } from "@gotomemory/pages";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { combinedAuthResolver } from "./auth.js";
import { AuthService } from "./auth-service.js";
import { buildServer } from "./server.js";

const AUTH = { authorization: "Bearer t1:u1" };

describe("gateway", () => {
  let app: FastifyInstance;
  let now = Date.parse("2026-06-24T00:00:00.000Z");
  beforeEach(() => {
    now = Date.parse("2026-06-24T00:00:00.000Z");
    const authRepo = new InMemoryAuthRepository();
    app = buildServer({
      service: new MemoryService({
        repo: new InMemoryMemoryRepository(),
        audit: new InMemoryAuditSink(),
        cipher: new EnvelopeCipher(EnvelopeCipher.generateMasterKey()),
      }),
      pages: new PageService({
        repo: new InMemoryPageRepository(),
        storage: new InMemoryPageStorage(),
        publicBaseUrl: "http://pages.local",
        clock: () => now,
        ids: (() => {
          let n = 0;
          return () => `id${++n}`;
        })(),
        slugs: (() => {
          let n = 0;
          return () => `slug${++n}`;
        })(),
      }),
      authService: new AuthService(authRepo, () => new Date(now)),
      auth: combinedAuthResolver(authRepo, { allowDevFallback: true }),
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

  it("rejects mock login when mock auth is disabled (production)", async () => {
    const authRepo = new InMemoryAuthRepository();
    const prod = buildServer({
      service: new MemoryService({
        repo: new InMemoryMemoryRepository(),
        audit: new InMemoryAuditSink(),
        cipher: new EnvelopeCipher(EnvelopeCipher.generateMasterKey()),
      }),
      authService: new AuthService(authRepo, () => new Date(now), undefined, false),
      auth: combinedAuthResolver(authRepo),
    });
    const res = await prod.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        provider: "google",
        provider_user_id: "victim",
        email: "victim@gmail.com",
        name: "Victim",
        mock_access_token: "mock_google_anything",
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("auth_method_disabled");
    await prod.close();
  });

  it("rejects forged dev tokens when the dev fallback is disabled (production default)", async () => {
    const authRepo = new InMemoryAuthRepository();
    const prod = buildServer({
      service: new MemoryService({
        repo: new InMemoryMemoryRepository(),
        audit: new InMemoryAuditSink(),
        cipher: new EnvelopeCipher(EnvelopeCipher.generateMasterKey()),
      }),
      authService: new AuthService(authRepo, () => new Date(now)),
      auth: combinedAuthResolver(authRepo), // allowDevFallback defaults to false
    });
    const res = await prod.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { authorization: "Bearer t1:victim" },
      payload: { scope: "personal", type: "preference", content: "x", source: "user_explicit" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("unauthenticated");
    await prod.close();
  });

  it("creates a real session from a mocked provider credential", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        provider: "google",
        provider_user_id: "mock-google-user-1",
        email: "user@gmail.com",
        name: "Google User",
        mock_access_token: "mock_google_local_credential",
      },
    });
    expect(login.statusCode).toBe(201);
    expect(login.json().access_token).toMatch(/^gtms_/);
    expect(login.json().user.email).toBe("user@gmail.com");

    const headers = { authorization: `Bearer ${login.json().access_token}` };
    const me = await app.inject({ method: "GET", url: "/v1/auth/me", headers });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.provider).toBe("google");

    const create = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers,
      payload: {
        scope: "personal",
        type: "preference",
        content: "prefers session auth",
        source: "user_explicit",
      },
    });
    expect(create.statusCode).toBe(201);
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

  it("rejects a body missing required fields with 400 invalid_request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: AUTH,
      payload: { scope: "personal", type: "preference" }, // no content/source
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_request");
  });

  it("rejects unknown fields and invalid enum values", async () => {
    const extra = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: AUTH,
      payload: { scope: "personal", type: "preference", content: "x", source: "api", bogus: true },
    });
    expect(extra.statusCode).toBe(400);

    const badEnum = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: AUTH,
      payload: { scope: "nope", type: "preference", content: "x", source: "api" },
    });
    expect(badEnum.statusCode).toBe(400);
    expect(badEnum.json().error.code).toBe("invalid_request");
  });

  it("authenticates before validating (bad body without creds -> 401, not 400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/memories",
      payload: { definitely: "invalid" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("unauthenticated");
  });

  it("publishes a page and exposes public JSON for frontend rendering", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/v1/pages",
      headers: AUTH,
      payload: {
        title: "Shared plan",
        kind: "html",
        content: '<h1 onclick="bad()">Plan</h1><script>alert(1)</script>',
        expires_in: { value: 2, unit: "hours" },
      },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().url).toBe("http://pages.local/p/slug1");
    expect(create.json().expires_at).toBe("2026-06-24T02:00:00.000Z");

    const page = await app.inject({ method: "GET", url: "/v1/pages/public/slug1" });
    expect(page.statusCode).toBe(200);
    expect(page.json().kind).toBe("html");
    expect(page.json().content).toContain("<script>");
    expect(page.headers["content-security-policy"]).toBeUndefined();
  });

  it("expires shared pages with a duration but keeps permanent pages", async () => {
    const temporary = await app.inject({
      method: "POST",
      url: "/v1/pages",
      headers: AUTH,
      payload: {
        title: "Temporary",
        kind: "markdown",
        content: "# temporary",
        expires_in: { value: 2, unit: "hours" },
      },
    });
    expect(temporary.statusCode).toBe(201);

    const permanent = await app.inject({
      method: "POST",
      url: "/v1/pages",
      headers: AUTH,
      payload: { title: "Permanent", kind: "markdown", content: "# permanent" },
    });
    expect(permanent.statusCode).toBe(201);
    expect(permanent.json().expires_at).toBeNull();

    now = Date.parse("2026-06-24T02:00:01.000Z");
    const expired = await app.inject({ method: "GET", url: "/v1/pages/public/slug1" });
    expect(expired.statusCode).toBe(404);

    const stillThere = await app.inject({ method: "GET", url: "/v1/pages/public/slug2" });
    expect(stillThere.statusCode).toBe(200);
    expect(stillThere.json().content).toBe("# permanent");
  });

  it("unpublishes a shared page", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/v1/pages",
      headers: AUTH,
      payload: { title: "Delete me", kind: "html", content: "<p>x</p>" },
    });
    const id = create.json().id as string;

    const del = await app.inject({ method: "DELETE", url: `/v1/pages/${id}`, headers: AUTH });
    expect(del.statusCode).toBe(204);

    const page = await app.inject({ method: "GET", url: "/v1/pages/public/slug1" });
    expect(page.statusCode).toBe(404);
  });
});

import { describe, expect, it } from "vitest";
import { createClient, SdkError } from "./index.js";

function stubFetch(status: number, body: unknown): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
}

const opts = { baseUrl: "http://x/v1", token: "t1:u1" };

describe("sdk createClient", () => {
  it("returns data on success", async () => {
    const client = createClient({
      ...opts,
      fetch: stubFetch(201, { id: "m1", status: "active", version: 1 }),
    });
    const res = await client.memories.create({
      scope: "personal",
      type: "preference",
      content: "x",
      source: "user_explicit",
    });
    expect(res.id).toBe("m1");
  });

  it("throws SdkError carrying the envelope code on failure", async () => {
    const client = createClient({
      ...opts,
      fetch: stubFetch(403, { error: { code: "policy_denied", message: "nope" } }),
    });
    await expect(
      client.context.build({ platform: "claude", client_id: "c", task: "t" }),
    ).rejects.toMatchObject({
      code: "policy_denied",
      status: 403,
    });
    await expect(client.memories.read("m1", "debug")).rejects.toBeInstanceOf(SdkError);
  });

  it("treats 204 delete as success", async () => {
    const client = createClient({ ...opts, fetch: stubFetch(204, undefined) });
    await expect(client.memories.delete("m1")).resolves.toBeUndefined();
  });

  it("supports auth login without an existing token", async () => {
    const client = createClient({
      baseUrl: "http://x/v1",
      fetch: stubFetch(201, {
        access_token: "gtms_test",
        token_type: "Bearer",
        expires_at: "2026-07-01T00:00:00.000Z",
        user: {
          id: "usr_google_mock-google-user-1",
          tenant_id: "t1",
          provider: "google",
          provider_user_id: "mock-google-user-1",
          email: "user@gmail.com",
          name: "Google User",
        },
      }),
    });
    const res = await client.auth.login({
      provider: "google",
      provider_user_id: "mock-google-user-1",
      email: "user@gmail.com",
      name: "Google User",
      mock_access_token: "mock_google_local_credential",
    });
    expect(res.access_token).toBe("gtms_test");
    expect(res.user.provider).toBe("google");
  });

  it("supports pages methods", async () => {
    const client = createClient({
      ...opts,
      fetch: stubFetch(201, {
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
    });
    const page = await client.pages.create({ title: "Page", kind: "html", content: "<h1>x</h1>" });
    expect(page.id).toBe("pg_1");
    expect(page.expires_at).toBeNull();
  });
});

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
});

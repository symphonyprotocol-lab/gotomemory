import { describe, expect, it } from "vitest";

import { createShareApp } from "./index.js";

describe("share server API", () => {
  it("creates public shares with high-entropy slugs and lists owned shares", async () => {
    const app = createShareApp({ now: fixedNow });
    const created = await json(
      await app.fetch(
        request("/v1/shares", "POST", {
          title: "Demo",
          messages: [{ role: "user", content: "Hello" }]
        })
      )
    );

    expect(created.status).toBe("active");
    expect(new URL(created.url).pathname.split("/").at(-1)?.length).toBeGreaterThanOrEqual(22);

    const listed = await json(await app.fetch(request("/v1/shares", "GET")));
    expect(listed.shares).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain("password_hash");
  });

  it("keeps password-protected content locked until unlock returns a view token", async () => {
    const app = createShareApp({ now: fixedNow, secret: "test" });
    const created = await json(
      await app.fetch(
        request("/v1/shares", "POST", {
          title: "Private",
          messages: [{ role: "assistant", content: "secret answer" }],
          visibility: "password",
          password: "correct"
        })
      )
    );
    const slug = new URL(created.url).pathname.split("/").at(-1);

    const locked = await app.fetch(request(`/v1/shares/public/${slug}`, "GET"));
    expect(locked.status).toBe(401);
    expect(await json(locked)).toEqual({
      status: "password_required",
      title: "Private",
      visibility: "password"
    });

    const unlock = await json(
      await app.fetch(request(`/v1/shares/public/${slug}/unlock`, "POST", { password: "correct" }))
    );
    const unlocked = await json(
      await app.fetch(
        new Request(`https://server.test/v1/shares/public/${slug}`, {
          headers: { authorization: `Bearer ${unlock.view_token}` }
        })
      )
    );

    expect(unlocked.share.messages[0].content).toBe("secret answer");
  });

  it("expires and deletes shares without returning content", async () => {
    const app = createShareApp({ now: fixedNow });
    const created = await json(
      await app.fetch(
        request("/v1/shares", "POST", {
          messages: [{ role: "user", content: "temporary" }],
          expires_in_hours: 1
        })
      )
    );
    const id = created.id;
    const slug = new URL(created.url).pathname.split("/").at(-1);

    await app.fetch(request(`/v1/shares/${id}`, "DELETE"));
    const deleted = await app.fetch(request(`/v1/shares/public/${slug}`, "GET"));

    expect(deleted.status).toBe(404);
  });

  it("rate limits repeated invalid password unlock attempts", async () => {
    const app = createShareApp({ now: fixedNow });
    const created = await json(
      await app.fetch(
        request("/v1/shares", "POST", {
          messages: [{ role: "user", content: "secret" }],
          visibility: "password",
          password: "correct"
        })
      )
    );
    const slug = new URL(created.url).pathname.split("/").at(-1);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await app.fetch(request(`/v1/shares/public/${slug}/unlock`, "POST", { password: "bad" }));
    }

    const limited = await app.fetch(
      request(`/v1/shares/public/${slug}/unlock`, "POST", { password: "bad" })
    );
    expect(limited.status).toBe(429);
  });
});

function request(path: string, method: string, body?: unknown) {
  return new Request(`https://server.test${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
}

async function json(response: Response): Promise<any> {
  return response.json();
}

function fixedNow() {
  return new Date("2026-06-25T00:00:00.000Z");
}

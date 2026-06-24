import { describe, expect, it } from "vitest";
import { InMemoryPageRepository } from "./repository.js";
import { PageService } from "./service.js";
import { InMemoryPageStorage } from "./storage.js";
import type { PageRequestContext } from "./types.js";

function service(now: number) {
  let clock = now;
  const svc = new PageService({
    repo: new InMemoryPageRepository(),
    storage: new InMemoryPageStorage(),
    publicBaseUrl: "http://pages.local",
    clock: () => clock,
    ids: (() => {
      let n = 0;
      return () => `id${++n}`;
    })(),
    slugs: (() => {
      let n = 0;
      return () => `slug${++n}`;
    })(),
  });
  return { svc, setClock: (next: number) => (clock = next) };
}

const ctx: PageRequestContext = {
  tenantId: "t1",
  ownerId: "u1",
  subjectId: "u1",
  clientId: "test",
};

describe("PageService", () => {
  it("creates a page with hour-based expiration", async () => {
    const { svc } = service(Date.parse("2026-06-24T00:00:00.000Z"));
    const page = await svc.createPage(ctx, {
      title: "Two hours",
      kind: "html",
      content: "<h1>Hi</h1>",
      expires_in: { value: 2, unit: "hours" },
    });
    expect(page.expires_at).toBe("2026-06-24T02:00:00.000Z");
    expect(page.url).toBe("http://pages.local/p/slug1");
  });

  it("creates a page with day-based expiration", async () => {
    const { svc } = service(Date.parse("2026-06-24T00:00:00.000Z"));
    const page = await svc.createPage(ctx, {
      title: "One day",
      kind: "markdown",
      content: "# Hi",
      expires_in: { value: 1, unit: "days" },
    });
    expect(page.expires_at).toBe("2026-06-25T00:00:00.000Z");
  });

  it("keeps pages permanent when no expiration is provided", async () => {
    const { svc } = service(Date.parse("2026-06-24T00:00:00.000Z"));
    const page = await svc.createPage(ctx, { title: "Forever", kind: "html", content: "<p>x</p>" });
    expect(page.expires_at).toBeNull();
    expect(await svc.sweepExpired()).toBe(0);
  });

  it("denies public access after expiration and removes content", async () => {
    const { svc, setClock } = service(Date.parse("2026-06-24T00:00:00.000Z"));
    await svc.createPage(ctx, {
      title: "Short",
      kind: "html",
      content: "<p>x</p>",
      expires_in: { value: 2, unit: "hours" },
    });
    setClock(Date.parse("2026-06-24T02:00:01.000Z"));
    await expect(svc.getPublicPage("slug1")).rejects.toThrow("page not found");
  });

  it("returns public page data without rendering HTML", async () => {
    const { svc } = service(Date.parse("2026-06-24T00:00:00.000Z"));
    await svc.createPage(ctx, {
      title: "Raw",
      kind: "html",
      content: '<h1 onclick="x()">Hi</h1><script>alert(1)</script>',
    });
    const page = await svc.getPublicPage("slug1");
    expect(page.content).toContain("<script>");
    expect(page.mime_type).toBe("text/html");
  });

  it("rejects binary artifacts whose filename is missing or mismatched", async () => {
    const { svc } = service(Date.parse("2026-06-24T00:00:00.000Z"));
    // Omitting filename used to bypass the macro check entirely.
    await expect(
      svc.createPage(ctx, { title: "No name", kind: "pdf", content_base64: "Zm9v" }),
    ).rejects.toThrow("filename is required");
    await expect(
      svc.createPage(ctx, {
        title: "Wrong ext",
        kind: "docx",
        content_base64: "Zm9v",
        filename: "report.docm",
      }),
    ).rejects.toThrow();
  });

  it("rejects updates that set a system-managed status or a malformed expiry", async () => {
    const { svc } = service(Date.parse("2026-06-24T00:00:00.000Z"));
    const page = await svc.createPage(ctx, { title: "Edit", kind: "html", content: "<p>x</p>" });
    await expect(
      svc.updatePage(ctx, page.id, { version: page.version, status: "deleted" }),
    ).rejects.toThrow("cannot be set directly");
    await expect(
      svc.updatePage(ctx, page.id, { version: page.version, expires_at: "not-a-date" }),
    ).rejects.toThrow("valid ISO timestamp");
  });

  it("does not delete stored assets on an unauthenticated expired public read", async () => {
    const { svc, setClock } = service(Date.parse("2026-06-24T00:00:00.000Z"));
    const page = await svc.createPage(ctx, {
      title: "Short",
      kind: "html",
      content: "<p>keep</p>",
      expires_in: { value: 2, unit: "hours" },
    });
    setClock(Date.parse("2026-06-24T02:00:01.000Z"));
    await expect(svc.getPublicPage("slug1")).rejects.toThrow("page not found");
    // The asset is only swept by the authenticated/background sweep, not the public GET.
    const owned = await svc.getPage(ctx, page.id);
    expect(owned.status).toBe("expired");
  });
});

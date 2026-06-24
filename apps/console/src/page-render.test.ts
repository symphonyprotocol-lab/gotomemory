import { describe, expect, it } from "vitest";
import { buildSandboxedDocument, renderMarkdown, sanitizeHtml } from "./lib/page-render.js";

describe("shared page renderer", () => {
  it("sanitizes scripts, event handlers, and javascript urls in the frontend", () => {
    const out = sanitizeHtml(
      '<h1 onclick="x()">Hi</h1><script>alert(1)</script><a href="javascript:alert(1)">x</a>',
    );
    expect(out).toContain("<h1>Hi</h1>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("javascript:");
  });

  it("neutralizes slash-separated event handlers and dangerous tags", () => {
    expect(sanitizeHtml("<svg/onload=alert(1)>")).not.toContain("onload");
    expect(sanitizeHtml('<object data="x"></object>')).not.toContain("<object");
    expect(sanitizeHtml("<style>body{}</style>")).not.toContain("<style");
  });

  it("wraps page HTML in a script-blocking sandbox document", () => {
    const doc = buildSandboxedDocument("<p>hi</p>");
    expect(doc).toContain("Content-Security-Policy");
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("<p>hi</p>");
  });

  it("renders markdown into static HTML", () => {
    const out = renderMarkdown("# Title\n\n- **one**\n- `two`");
    expect(out).toContain("<h1>Title</h1>");
    expect(out).toContain("<strong>one</strong>");
    expect(out).toContain("<code>two</code>");
  });
});

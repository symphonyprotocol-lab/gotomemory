import { describe, expect, it } from "vitest";

import { renderConversationHtml, renderMarkdown, sanitizeRenderedHtml } from "./index.js";

describe("readonly renderer", () => {
  it("renders conversation messages as readonly HTML", () => {
    expect(
      renderConversationHtml([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "**Hi**" }
      ])
    ).toContain('data-readonly="true"');
  });

  it("strips script tags and event handlers", () => {
    const html = sanitizeRenderedHtml('<img src="data:x" onerror="alert(1)"><script>x</script>');

    expect(html).not.toContain("script");
    expect(html).not.toContain("onerror");
  });

  it("blocks javascript URLs and external images", () => {
    const html = sanitizeRenderedHtml(
      '<a href="javascript:alert(1)">x</a><img src="https://x/y.png">'
    );

    expect(html).not.toContain("javascript:");
    expect(html).toContain("external image removed");
  });

  it("escapes markdown HTML before formatting", () => {
    expect(renderMarkdown("<script>alert(1)</script>\n\n`code`")).not.toContain("<script>");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MemoryPanel, SharePreview } from "./index.js";

describe("shared UI", () => {
  it("renders ready memories and only selected private memories", () => {
    const html = renderToStaticMarkup(
      <MemoryPanel
        selectedPrivateIds={["mem_2"]}
        context={{
          ready: [memory("mem_1", "Use TypeScript", false)],
          needs_confirm: [memory("mem_2", "Private fact", true), memory("mem_3", "Hidden", true)]
        }}
      />
    );

    expect(html).toContain("Use TypeScript");
    expect(html).toContain("Private fact");
    expect(html).not.toContain("Hidden");
  });

  it("renders share previews through the readonly renderer", () => {
    const html = renderToStaticMarkup(
      <SharePreview
        share={{
          id: "sc_1",
          user_id: "local",
          slug: "abcdefghijklmnopqrstuv",
          title: "Shared",
          messages: [{ role: "assistant", content: "<script>x</script>safe" }],
          visibility: "public",
          status: "active",
          expires_at: null,
          view_count: 0,
          created_at: "2026-06-25T00:00:00.000Z"
        }}
      />
    );

    expect(html).toContain("gotomemory-share");
    expect(html).not.toContain("<script>");
  });
});

function memory(id: string, content: string, is_private: boolean) {
  return {
    id,
    user_id: "local",
    content,
    category: "preference" as const,
    is_private,
    source: "manual" as const,
    embedding: null,
    rev: 0,
    deleted_at: null,
    created_at: "2026-06-25T00:00:00.000Z",
    updated_at: "2026-06-25T00:00:00.000Z"
  };
}

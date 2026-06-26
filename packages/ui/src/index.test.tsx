import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MemoryPanel } from "./index.js";

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

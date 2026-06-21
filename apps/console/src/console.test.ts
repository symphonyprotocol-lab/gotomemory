import type { ContextBuildResponse, SearchResponse } from "@gotomemory/sdk";
import { describe, expect, it } from "vitest";
import { escapeHtml, renderContext, renderItems } from "./ui.js";

describe("console ui", () => {
  it("escapes html to prevent injection from memory content", () => {
    expect(escapeHtml('<script>"x"</script>')).toBe("&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
  });

  it("renders a sensitivity badge and never the full content", () => {
    const items: SearchResponse["items"] = [
      {
        id: "abcdef1234",
        summary_preview: "prefers ts",
        sensitivity: "private",
        version: 1,
        score: 1,
        access: { can_read_content: false, can_inject: true, requires_confirmation: true },
      },
    ];
    const html = renderItems(items);
    expect(html).toContain("sens private");
    expect(html).toContain("prefers ts");
    expect(html).toContain("inject · confirm");
  });

  it("renders empty state", () => {
    expect(renderItems([])).toContain("No memories");
  });

  it("renders context with omitted reasons", () => {
    const res: ContextBuildResponse = {
      context: "Memory:\n- foo",
      memory_ids: ["m1"],
      redacted: false,
      requires_confirmation: false,
      decision_id: "dec_1",
      omitted: [{ memory_id: "secret123", reason: "sensitivity_exceeds_policy" }],
    };
    const html = renderContext(res);
    expect(html).toContain("dec_1");
    expect(html).toContain("omitted:");
    expect(html).toContain("sensitivity_exceeds_policy");
  });
});

import type { ContextBuildResponse, SearchResponse } from "@gotomemory/sdk";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape memory-derived text before it reaches innerHTML (previews are untrusted). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Render search results — preview only, with sensitivity and access flags. */
export function renderResults(items: SearchResponse["items"]): string {
  if (items.length === 0) return '<li class="muted">（无结果）</li>';
  return items
    .map((i) => {
      const flags = [
        i.access.can_read_content ? "read" : "",
        i.access.can_inject ? "inject" : "",
        i.access.requires_confirmation ? "confirm" : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `<li><span class="sens ${escapeHtml(i.sensitivity)}">${escapeHtml(
        i.sensitivity,
      )}</span> ${escapeHtml(i.summary_preview)} <em>${escapeHtml(flags)}</em></li>`;
    })
    .join("");
}

/** Human summary of what build/confirm omitted, so the user sees what was held back. */
export function renderOmitted(res: Pick<ContextBuildResponse, "omitted">): string {
  if (!res.omitted.length) return "";
  const list = res.omitted
    .map((o) => `${escapeHtml(o.memory_id.slice(0, 8))}（${escapeHtml(o.reason)}）`)
    .join("、");
  return `<p class="muted">省略：${list}</p>`;
}

import type { ContextBuildResponse, SearchResponse } from "@gotomemory/sdk";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Render search results — preview only, with a sensitivity badge and access flags. */
export function renderItems(items: SearchResponse["items"]): string {
  if (items.length === 0) return '<li class="empty">No memories.</li>';
  return items
    .map((i) => {
      const flags = [
        i.access.can_read_content ? "read" : "",
        i.access.can_inject ? "inject" : "",
        i.access.requires_confirmation ? "confirm" : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `<li><code>${escapeHtml(i.id.slice(0, 8))}</code> <span class="sens ${escapeHtml(
        i.sensitivity,
      )}">${escapeHtml(i.sensitivity)}</span> ${escapeHtml(i.summary_preview)} <em>${escapeHtml(
        flags,
      )}</em></li>`;
    })
    .join("");
}

/** Render the result of a context build: the injectable text plus what was omitted. */
export function renderContext(res: ContextBuildResponse): string {
  const omitted = res.omitted
    .map((o) => `${escapeHtml(o.memory_id.slice(0, 8))} (${escapeHtml(o.reason)})`)
    .join(", ");
  return [
    `<p>decision: <code>${escapeHtml(res.decision_id)}</code> · injected ${res.memory_ids.length}` +
      (res.requires_confirmation ? " · <strong>requires confirmation</strong>" : "") +
      "</p>",
    `<pre>${escapeHtml(res.context ?? "(nothing injected)")}</pre>`,
    omitted ? `<p class="omitted">omitted: ${omitted}</p>` : "",
  ].join("");
}

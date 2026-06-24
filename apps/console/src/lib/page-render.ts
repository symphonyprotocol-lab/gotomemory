import type { PublicPageResponse } from "@gotomemory/sdk";

export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Best-effort HTML scrubbing kept as defense-in-depth only. The real isolation boundary is
 * the sandboxed iframe in `buildSandboxedDocument` — regex sanitizing is inherently
 * bypassable, so it must never be the sole XSS defense for shared HTML.
 */
export function sanitizeHtml(input: string): string {
  return (
    input
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<(iframe|object|embed|style|link|base|meta|form)\b[\s\S]*?>/gi, "")
      .replace(/<\/(iframe|object|embed|style|form)>/gi, "")
      // Strip inline event handlers regardless of the separator before the attribute
      // (space, slash, tab, newline) so `<svg/onload=...>` is also neutralized.
      .replace(/[\s/]on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, "")
      .replace(/\s+(href|src)\s*=\s*javascript:[^\s>]+/gi, "")
  );
}

/**
 * Wrap rendered page HTML in a standalone document destined for a sandboxed iframe. The CSP
 * forbids all scripting and only permits inline styles plus images/fonts, so even if a
 * payload slips past `sanitizeHtml` it cannot execute or exfiltrate.
 */
export function buildSandboxedDocument(bodyHtml: string): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta http-equiv="Content-Security-Policy" ',
    "content=\"default-src 'none'; img-src data: https:; ",
    "style-src 'unsafe-inline'; font-src data: https:; media-src data: https:\">",
    "<style>body{margin:0;padding:0;font-family:ui-sans-serif,system-ui,sans-serif;",
    "color:#111;line-height:1.6;word-break:break-word}img{max-width:100%}</style>",
    "</head><body>",
    bodyHtml,
    "</body></html>",
  ].join("");
}

function inlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inList = false;
  let inCode = false;
  const code: string[] = [];

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code.length = 0;
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1]!.length;
      out.push(`<h${level}>${inlineMarkdown(heading[2]!)}</h${level}>`);
      continue;
    }
    const list = /^[-*]\s+(.+)$/.exec(line);
    if (list) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inlineMarkdown(list[1]!)}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  closeList();
  if (inCode) out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  return sanitizeHtml(out.join("\n"));
}

export function renderSharedPage(page: PublicPageResponse): string {
  if (page.kind === "html") return sanitizeHtml(page.content);
  if (page.kind === "markdown") return renderMarkdown(page.content);
  if (page.kind === "pdf") {
    // Only honor a data: URI that is explicitly a PDF; anything else (e.g. data:text/html)
    // is treated as raw base64 PDF bytes so an attacker cannot smuggle an executable
    // document into the <object>.
    const src = page.content.startsWith("data:application/pdf")
      ? page.content
      : `data:application/pdf;base64,${page.content.replace(/^data:[^,]*,/, "")}`;
    return [
      `<p>This PDF is displayed as a read-only shared artifact.</p>`,
      `<object data="${escapeHtml(src)}" type="application/pdf" width="100%" height="720">`,
      `<p>PDF preview is unavailable. File: ${escapeHtml(page.filename ?? "document.pdf")}</p>`,
      "</object>",
    ].join("");
  }
  const labels = {
    docx: "Word document",
    xlsx: "Excel workbook",
    pptx: "PowerPoint deck",
  } as const;
  return [
    `<p>This ${labels[page.kind]} was published as a read-only shared artifact.</p>`,
    `<p>Preview conversion is not available in this local build. File: ${escapeHtml(
      page.filename ?? `${page.title}.${page.kind}`,
    )}</p>`,
  ].join("");
}

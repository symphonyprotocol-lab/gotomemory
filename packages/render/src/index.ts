import type { ConversationMessage } from "@gotomemory/contracts";

export function renderConversationHtml(messages: ConversationMessage[]): string {
  const body = messages
    .map(
      (message) =>
        `<article class="message message-${message.role}"><strong>${message.role}</strong>${renderMarkdown(message.content)}</article>`
    )
    .join("");

  return `<section class="gotomemory-share" data-readonly="true">${body}</section>`;
}

export function renderMarkdown(markdown: string): string {
  const codeBlocks: string[] = [];
  const withoutCode = markdown.replace(/```([\s\S]*?)```/g, (_match, code: string) => {
    const index = codeBlocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`) - 1;
    return `@@CODE_BLOCK_${index}@@`;
  });

  let html = escapeHtml(stripDangerousHtml(withoutCode));
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\n{2,}/g, "</p><p>");
  html = `<p>${html.replace(/\n/g, "<br>")}</p>`;

  for (const [index, block] of codeBlocks.entries()) {
    html = html.replace(`@@CODE_BLOCK_${index}@@`, block);
  }

  return sanitizeRenderedHtml(html);
}

export function sanitizeRenderedHtml(html: string): string {
  return stripDangerousHtml(html)
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, "")
    .replace(/<img\b(?![^>]*\bsrc=(["'])data:)[^>]*>/gi, "[external image removed]");
}

function stripDangerousHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

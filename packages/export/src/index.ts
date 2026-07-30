import type { ConversationMessage } from "@gotomemory/contracts";

import { isSafeImageUrl, parseMarkdownBlocks, type ParsedBlock } from "./blocks.js";
import { conversationToNotionBlocks } from "./notion.js";

export { isHttpUrl, isSafeImageUrl, parseMarkdownBlocks, type ParsedBlock } from "./blocks.js";
export {
  conversationToNotionBlocks,
  chunkNotionBlocks,
  toNotionCodeLanguage,
  toNotionRichText,
  NOTION_RICH_TEXT_LIMIT,
  NOTION_BLOCKS_PER_APPEND,
  type NotionBlock,
  type NotionRichText,
  type NotionParagraphBlock,
  type NotionHeading1Block,
  type NotionHeading2Block,
  type NotionHeading3Block,
  type NotionCodeBlock,
  type NotionEquationBlock,
  type NotionImageBlock,
  type NotionTableBlock,
  type NotionTableRowBlock
} from "./notion.js";

// PDF is deliberately absent: the local byte-writer it once used truncated
// long conversations and rendered CJK as mojibake. PDF export now goes through
// `toPrintableHtml` + the browser's print-to-PDF (see the extension panel),
// which is loss-free and font-complete.
export type ExportFormat = "markdown" | "txt" | "obsidian" | "docx" | "html" | "json" | "notion";

export interface ExportInput {
  title: string;
  messages: ConversationMessage[];
  format: ExportFormat;
}

export interface ExportedConversation {
  filename: string;
  mimeType: string;
  content: string | Uint8Array;
}

export function exportConversation(input: ExportInput): ExportedConversation {
  switch (input.format) {
    case "markdown":
      return textExport(`${slugify(input.title)}.md`, "text/markdown", toMarkdown(input));
    case "txt":
      return textExport(`${slugify(input.title)}.txt`, "text/plain", toText(input.messages));
    case "obsidian":
      return textExport(`${slugify(input.title)}.md`, "text/markdown", toObsidianMarkdown(input));
    case "json":
      return textExport(
        `${slugify(input.title)}.json`,
        "application/json",
        JSON.stringify({ title: input.title, messages: input.messages }, null, 2)
      );
    case "html":
      return textExport(`${slugify(input.title)}.html`, "text/html", toPrintableHtml(input));
    case "notion":
      return textExport(
        `${slugify(input.title)}.notion.json`,
        "application/json",
        JSON.stringify({ blocks: conversationToNotionBlocks(input) }, null, 2)
      );
    case "docx":
      return {
        filename: `${slugify(input.title)}.docx`,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content: toDocx(input)
      };
  }
}

export function toMarkdown(input: Pick<ExportInput, "title" | "messages">): string {
  return [`# ${input.title}`, "", ...input.messages.map(formatMarkdownMessage)].join("\n");
}

export function toText(messages: ConversationMessage[]): string {
  return messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");
}

export function toPrintableHtml(input: Pick<ExportInput, "title" | "messages">): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(input.title)}</title>`,
    "<style>",
    "body{font-family:Inter,system-ui,sans-serif;line-height:1.55;max-width:840px;margin:40px auto;padding:0 24px;color:#161616}",
    ".message{border-top:1px solid #ddd;padding:18px 0}.role{text-transform:uppercase;font-size:12px;color:#666;letter-spacing:.08em}",
    "pre{white-space:pre-wrap;background:#f6f6f6;padding:12px;border-radius:6px}",
    "code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em}",
    "table{border-collapse:collapse;margin:12px 0;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;vertical-align:top}th{background:#f2f2f2}",
    ".math-block{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#fafafa;padding:12px;border-radius:6px;margin:12px 0}",
    "figure{margin:12px 0}img{max-width:100%;height:auto}figcaption{font-size:12px;color:#666}",
    "@media print{body{margin:0;max-width:none}.message{break-inside:avoid}}",
    "</style>",
    "</head>",
    "<body>",
    `<h1>${escapeHtml(input.title)}</h1>`,
    renderPrintableMessages(input.messages),
    "</body>",
    "</html>"
  ].join("");
}

function renderPrintableMessages(messages: ConversationMessage[]): string {
  const body = messages
    .map(
      (message) =>
        `<article class="message message-${message.role}"><div class="role">${escapeHtml(message.role)}</div>${renderPrintableMarkdown(message.content)}</article>`
    )
    .join("");

  return `<section class="gotomemory-share" data-readonly="true">${body}</section>`;
}

/**
 * Fidelity renderer for the printable HTML / print-to-PDF path (spec §6.2):
 * fenced code stays in <pre><code> with its language, tables become real
 * <table> markup, math is kept as literal TeX text, and images become <img>
 * only for http(s)/data URLs. All content is HTML-escaped first; the only
 * tags in the output are the ones generated here.
 */
export function renderPrintableMarkdown(markdown: string): string {
  return parseMarkdownBlocks(markdown).map(renderPrintableBlock).join("");
}

function renderPrintableBlock(block: ParsedBlock): string {
  switch (block.kind) {
    case "code": {
      const languageClass = /^[a-z0-9#+.-]+$/.test(block.language)
        ? ` class="language-${block.language}"`
        : "";
      return `<pre><code${languageClass}>${escapeHtml(block.code)}</code></pre>`;
    }
    case "equation":
      return `<div class="math-block">$$\n${escapeHtml(block.expression)}\n$$</div>`;
    case "table": {
      const [header = [], ...rows] = block.rows;
      const head = `<thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead>`;
      const body = rows.length
        ? `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`
        : "";
      return `<table>${head}${body}</table>`;
    }
    case "image":
      return isSafeImageUrl(block.url)
        ? `<figure><img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}">${
            block.alt ? `<figcaption>${escapeHtml(block.alt)}</figcaption>` : ""
          }</figure>`
        : `<p>[image: ${escapeHtml(block.alt || block.url)}]</p>`;
    case "heading": {
      // The document title owns <h1>; shift content headings one level down.
      const level = Math.min(block.level + 1, 6);
      return `<h${level}>${renderInline(block.text)}</h${level}>`;
    }
    case "paragraph":
      return `<p>${renderInline(block.text)}</p>`;
  }
}

const INLINE_CODE_SENTINEL = "\u0000";

function renderInline(text: string): string {
  let html = escapeHtml(text);

  // Protect inline code spans so image/bold rewriting cannot touch them.
  const codeSpans: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_match, code: string) => {
    const index = codeSpans.push(`<code>${code}</code>`) - 1;
    return `${INLINE_CODE_SENTINEL}${index}${INLINE_CODE_SENTINEL}`;
  });

  // Inline images: URLs are already HTML-escaped, safe for the src attribute.
  html = html.replace(/!\[([^\]]*)\]\(([^()\s]+)\)/g, (match, alt: string, url: string) =>
    isSafeImageUrl(url) ? `<img src="${url}" alt="${alt}">` : match
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  html = html.replace(
    new RegExp(`${INLINE_CODE_SENTINEL}(\\d+)${INLINE_CODE_SENTINEL}`, "g"),
    (_match, index: string) => codeSpans[Number(index)] ?? ""
  );

  return html.replace(/\n/g, "<br>");
}

export function toDocx(input: Pick<ExportInput, "title" | "messages">): Uint8Array {
  const documentXml = wordDocumentXml(input);
  return zipStore({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    "word/document.xml": documentXml
  });
}

function toObsidianMarkdown(input: Pick<ExportInput, "title" | "messages">): string {
  return [
    "---",
    `title: ${JSON.stringify(input.title)}`,
    "source: gotomemory",
    "---",
    "",
    toMarkdown(input)
  ].join("\n");
}

function formatMarkdownMessage(message: ConversationMessage): string {
  return `## ${message.role}\n\n${message.content}\n`;
}

function textExport(filename: string, mimeType: string, content: string): ExportedConversation {
  return { filename, mimeType, content };
}

/**
 * Filename stem for an exported conversation.
 *
 * Only filesystem-reserved characters are replaced. The previous ASCII-only
 * slug erased CJK entirely, so every Chinese-titled conversation downloaded as
 * the same fallback "conversation" filename - the common case for this product.
 */
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const RESERVED_FILENAME_CHARS = /[\u0000-\u001f<>:"/\\|?*\s]+/g;
const MAX_FILENAME_STEM = 80;

function slugify(value: string): string {
  const cleaned = value
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(RESERVED_FILENAME_CHARS, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, MAX_FILENAME_STEM)
    // Windows rejects a trailing dot or space on the stem.
    .replace(/^[-.]+|[-.]+$/g, "");

  return cleaned || "conversation";
}

function wordDocumentXml(input: Pick<ExportInput, "title" | "messages">): string {
  const paragraphs = [
    paragraph(input.title, "Title"),
    ...input.messages.flatMap((message) => [
      paragraph(message.role.toUpperCase(), "Heading2"),
      ...message.content.split(/\n+/).map((line) => paragraph(line))
    ])
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`;
}

function paragraph(text: string, style?: "Title" | "Heading2"): string {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function zipStore(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const fileEntries = Object.entries(files).map(([name, content]) => ({
    name,
    nameBytes: encoder.encode(name),
    data: encoder.encode(content)
  }));
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const file of fileEntries) {
    const crc = crc32(file.data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(file.nameBytes.length),
      u16(0),
      file.nameBytes,
      file.data
    ]);
    chunks.push(local);
    centralDirectory.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(file.data.length),
        u32(file.data.length),
        u16(file.nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        file.nameBytes
      ])
    );
    offset += local.length;
  }

  const central = concat(centralDirectory);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(fileEntries.length),
    u16(fileEntries.length),
    u32(central.length),
    u32(offset),
    u16(0)
  ]);

  return concat([...chunks, central, end]);
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeXml(value: string): string {
  return escapeHtml(value).replace(/'/g, "&apos;");
}

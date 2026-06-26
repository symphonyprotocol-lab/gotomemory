import type { ConversationMessage } from "@gotomemory/contracts";
import { renderConversationHtml } from "@gotomemory/render";

export type ExportFormat = "markdown" | "txt" | "obsidian" | "pdf" | "docx" | "html" | "json";

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
    case "docx":
      return {
        filename: `${slugify(input.title)}.docx`,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content: toDocx(input)
      };
    case "pdf":
      return {
        filename: `${slugify(input.title)}.pdf`,
        mimeType: "application/pdf",
        content: pagedPdf(toText(input.messages))
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

export function previewHtml(messages: ConversationMessage[]): string {
  return renderConversationHtml(messages);
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
    "@media print{body{margin:0;max-width:none}.message{break-inside:avoid}}",
    "</style>",
    "</head>",
    "<body>",
    `<h1>${escapeHtml(input.title)}</h1>`,
    renderConversationHtml(input.messages),
    "</body>",
    "</html>"
  ].join("");
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

function slugify(value: string): string {
  return (
    value
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "conversation"
  );
}

function pagedPdf(text: string): Uint8Array {
  const escaped = text
    .split(/\n+/)
    .slice(0, 42)
    .map((line, index) => `${index === 0 ? "" : "0 -16 Td "}${pdfText(line.slice(0, 96))} Tj`)
    .join("\n");
  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${escaped.length + 32} >> stream
BT /F1 12 Tf 72 720 Td
${escaped}
ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R >>
%%EOF`;
  return new TextEncoder().encode(pdf);
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

function pdfText(value: string): string {
  return `(${value.replace(/[()\\]/g, "\\$&")})`;
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

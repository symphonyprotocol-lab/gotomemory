import { describe, expect, it } from "vitest";

import {
  exportConversation,
  previewHtml,
  toDocx,
  toMarkdown,
  toPrintableHtml,
  toText
} from "./index.js";

const messages = [
  { role: "user" as const, content: "Need a plan" },
  { role: "assistant" as const, content: "Use **TypeScript**" }
];

describe("conversation export", () => {
  it("exports Markdown locally", () => {
    expect(toMarkdown({ title: "Demo", messages })).toContain("## assistant");
  });

  it("exports plain text locally", () => {
    expect(toText(messages)).toContain("ASSISTANT: Use **TypeScript**");
  });

  it("exports Obsidian-compatible Markdown", () => {
    const exported = exportConversation({ title: "Demo Chat", messages, format: "obsidian" });

    expect(exported.filename).toBe("demo-chat.md");
    expect(exported.content).toContain("source: gotomemory");
  });

  it("exports a minimal PDF without a server dependency", () => {
    const exported = exportConversation({ title: "Demo", messages, format: "pdf" });

    expect(exported.mimeType).toBe("application/pdf");
    expect(new TextDecoder().decode(exported.content as Uint8Array)).toContain("%PDF");
  });

  it("exports printable HTML for browser PDF workflows", () => {
    const html = toPrintableHtml({ title: "Demo", messages });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("gotomemory-share");
    expect(html).not.toContain("<script>");
  });

  it("exports a real DOCX zip with Word document parts", () => {
    const docx = toDocx({ title: "Demo", messages });
    const text = new TextDecoder().decode(docx);

    expect(docx[0]).toBe(0x50);
    expect(docx[1]).toBe(0x4b);
    expect(text).toContain("word/document.xml");
    expect(text).toContain("[Content_Types].xml");
  });

  it("uses the shared sanitizer-backed preview renderer", () => {
    expect(previewHtml(messages)).toContain("gotomemory-share");
  });
});

import { describe, expect, it } from "vitest";

import {
  chunkNotionBlocks,
  conversationToNotionBlocks,
  NOTION_BLOCKS_PER_APPEND,
  NOTION_RICH_TEXT_LIMIT,
  toNotionCodeLanguage,
  toNotionRichText,
  type NotionBlock,
  type NotionCodeBlock,
  type NotionEquationBlock,
  type NotionHeading2Block,
  type NotionImageBlock,
  type NotionParagraphBlock,
  type NotionTableBlock
} from "./index.js";

function plainText(richText: { text: { content: string } }[]): string {
  return richText.map((item) => item.text.content).join("");
}

describe("conversationToNotionBlocks", () => {
  it("emits a title heading and role headings consistent with other formats", () => {
    const blocks = conversationToNotionBlocks({
      title: "Demo Chat",
      messages: [
        { role: "user", content: "Need a plan" },
        { role: "assistant", content: "Use TypeScript" }
      ]
    });

    expect(blocks[0]).toEqual({
      object: "block",
      type: "heading_1",
      heading_1: { rich_text: [{ type: "text", text: { content: "Demo Chat", link: null } }] }
    });

    const roleHeadings = blocks.filter(
      (block): block is NotionHeading2Block => block.type === "heading_2"
    );
    expect(roleHeadings.map((block) => plainText(block.heading_2.rich_text))).toEqual([
      "User",
      "Assistant"
    ]);
  });

  it("maps plain paragraphs to paragraph blocks", () => {
    const blocks = conversationToNotionBlocks({
      title: "T",
      messages: [{ role: "user", content: "First paragraph.\n\nSecond paragraph." }]
    });

    const paragraphs = blocks.filter(
      (block): block is NotionParagraphBlock => block.type === "paragraph"
    );
    expect(paragraphs.map((block) => plainText(block.paragraph.rich_text))).toEqual([
      "First paragraph.",
      "Second paragraph."
    ]);
  });

  it("maps fenced code to code blocks with a Notion language", () => {
    const blocks = conversationToNotionBlocks({
      title: "T",
      messages: [
        { role: "assistant", content: '```ts\nconst x: number = 1;\nconsole.log("|");\n```' }
      ]
    });

    const code = blocks.find((block): block is NotionCodeBlock => block.type === "code");
    expect(code).toBeDefined();
    expect(code?.code.language).toBe("typescript");
    expect(plainText(code!.code.rich_text)).toBe('const x: number = 1;\nconsole.log("|");');
  });

  it("falls back to plain text for unknown code languages", () => {
    const blocks = conversationToNotionBlocks({
      title: "T",
      messages: [{ role: "assistant", content: "```made-up-lang\nhello\n```" }]
    });

    const code = blocks.find((block): block is NotionCodeBlock => block.type === "code");
    expect(code?.code.language).toBe("plain text");
  });

  it("maps Markdown tables to table blocks with table_row children", () => {
    const blocks = conversationToNotionBlocks({
      title: "T",
      messages: [
        { role: "assistant", content: "| Name | Score |\n| --- | --- |\n| Ada | 100 |\n| Bob |" }
      ]
    });

    const table = blocks.find((block): block is NotionTableBlock => block.type === "table");
    expect(table).toBeDefined();
    expect(table?.table.table_width).toBe(2);
    expect(table?.table.has_column_header).toBe(true);
    expect(table?.table.has_row_header).toBe(false);
    expect(table?.table.children).toHaveLength(3);
    expect(table?.table.children[0]?.type).toBe("table_row");
    expect(table?.table.children[1]?.table_row.cells.map(plainText)).toEqual(["Ada", "100"]);
    // Short rows are padded to table_width with empty cells.
    expect(table?.table.children[2]?.table_row.cells).toHaveLength(2);
    expect(plainText(table!.table.children[2]!.table_row.cells[1]!)).toBe("");
  });

  it("maps $$ math to equation blocks without the delimiters", () => {
    const blocks = conversationToNotionBlocks({
      title: "T",
      messages: [{ role: "assistant", content: "$$\n\\int_0^1 x\\,dx\n$$\n\n$$e^{i\\pi}+1=0$$" }]
    });

    const equations = blocks.filter(
      (block): block is NotionEquationBlock => block.type === "equation"
    );
    expect(equations.map((block) => block.equation.expression)).toEqual([
      "\\int_0^1 x\\,dx",
      "e^{i\\pi}+1=0"
    ]);
  });

  it("maps http(s) images to external image blocks", () => {
    const blocks = conversationToNotionBlocks({
      title: "T",
      messages: [{ role: "assistant", content: "![diagram](https://example.com/d.png)" }]
    });

    const image = blocks.find((block): block is NotionImageBlock => block.type === "image");
    expect(image).toEqual({
      object: "block",
      type: "image",
      image: { type: "external", external: { url: "https://example.com/d.png" } }
    });
  });

  it("keeps a textual trace for images Notion cannot embed", () => {
    const blocks = conversationToNotionBlocks({
      title: "T",
      messages: [{ role: "assistant", content: "![local shot](file:///tmp/shot.png)" }]
    });

    expect(blocks.some((block) => block.type === "image")).toBe(false);
    const paragraphs = blocks.filter(
      (block): block is NotionParagraphBlock => block.type === "paragraph"
    );
    expect(plainText(paragraphs[0]!.paragraph.rich_text)).toBe("[image: local shot]");
  });

  it("chunks text longer than the 2000-char rich_text limit", () => {
    const long = "a".repeat(NOTION_RICH_TEXT_LIMIT * 2 + 500);
    const blocks = conversationToNotionBlocks({
      title: "T",
      messages: [{ role: "user", content: long }]
    });

    const paragraph = blocks.find(
      (block): block is NotionParagraphBlock => block.type === "paragraph"
    );
    const lengths = paragraph?.paragraph.rich_text.map((item) => item.text.content.length);
    expect(lengths).toEqual([2000, 2000, 500]);
    expect(plainText(paragraph!.paragraph.rich_text)).toBe(long);
  });

  it("chunks long code content too", () => {
    const longCode = "x".repeat(NOTION_RICH_TEXT_LIMIT + 10);
    const blocks = conversationToNotionBlocks({
      title: "T",
      messages: [{ role: "assistant", content: `\`\`\`js\n${longCode}\n\`\`\`` }]
    });

    const code = blocks.find((block): block is NotionCodeBlock => block.type === "code");
    expect(code?.code.language).toBe("javascript");
    expect(code?.code.rich_text).toHaveLength(2);
    expect(code?.code.rich_text.every((item) => item.text.content.length <= 2000)).toBe(true);
  });

  it("demotes in-message headings below the role heading", () => {
    const blocks = conversationToNotionBlocks({
      title: "T",
      messages: [{ role: "assistant", content: "# Section\n\nBody" }]
    });

    expect(blocks.map((block) => block.type)).toEqual([
      "heading_1",
      "heading_2",
      "heading_3",
      "paragraph"
    ]);
  });
});

describe("chunkNotionBlocks", () => {
  function block(index: number): NotionBlock {
    return {
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: toNotionRichText(`block ${index}`) }
    };
  }

  it("keeps a short list as a single chunk", () => {
    const blocks = Array.from({ length: 5 }, (_, i) => block(i));
    expect(chunkNotionBlocks(blocks)).toEqual([blocks]);
  });

  it("splits at the 100-block blocks.children.append limit by default", () => {
    const blocks = Array.from({ length: 250 }, (_, i) => block(i));
    const chunks = chunkNotionBlocks(blocks);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(NOTION_BLOCKS_PER_APPEND);
    expect(chunks[1]).toHaveLength(NOTION_BLOCKS_PER_APPEND);
    expect(chunks[2]).toHaveLength(50);
    // Order is preserved across chunks.
    expect(chunks.flat()).toEqual(blocks);
  });

  it("honors a custom chunk size", () => {
    const blocks = Array.from({ length: 7 }, (_, i) => block(i));
    expect(chunkNotionBlocks(blocks, 3).map((chunk) => chunk.length)).toEqual([3, 3, 1]);
  });

  it("returns no chunks for an empty list", () => {
    expect(chunkNotionBlocks([])).toEqual([]);
  });
});

describe("toNotionCodeLanguage", () => {
  it("normalizes common aliases", () => {
    expect(toNotionCodeLanguage("ts")).toBe("typescript");
    expect(toNotionCodeLanguage("py")).toBe("python");
    expect(toNotionCodeLanguage("sh")).toBe("shell");
    expect(toNotionCodeLanguage("cpp")).toBe("c++");
    expect(toNotionCodeLanguage("Dockerfile")).toBe("docker");
  });

  it("passes through supported languages and falls back otherwise", () => {
    expect(toNotionCodeLanguage("rust")).toBe("rust");
    expect(toNotionCodeLanguage("")).toBe("plain text");
    expect(toNotionCodeLanguage("klingon")).toBe("plain text");
  });
});

describe("toNotionRichText", () => {
  it("returns an empty array for empty text", () => {
    expect(toNotionRichText("")).toEqual([]);
  });

  it("keeps short text as a single chunk", () => {
    expect(toNotionRichText("hello")).toEqual([
      { type: "text", text: { content: "hello", link: null } }
    ]);
  });
});

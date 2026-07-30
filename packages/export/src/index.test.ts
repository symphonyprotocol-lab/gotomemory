import { describe, expect, it } from "vitest";

import {
  exportConversation,
  parseMarkdownBlocks,
  toDocx,
  toMarkdown,
  toPrintableHtml,
  toText
} from "./index.js";

const messages = [
  { role: "user" as const, content: "Need a plan" },
  { role: "assistant" as const, content: "Use **TypeScript**" }
];

const codeContent = '```python\nprint("hi > there")\n```';
const tableContent = "| Name | Score |\n| --- | --- |\n| Ada | 100 |\n| Bob | 42 |";
const blockMathContent = "$$\n\\int_0^1 x\\,dx = \\frac{1}{2}\n$$";
const inlineMathContent = "Energy is $E=mc^2$ at rest.";
const imageContent = "![diagram](https://example.com/diagram.png)";
const unsafeImageContent = "![leak](file:///etc/passwd)";

const richMessages = [
  { role: "user" as const, content: `${tableContent}\n\n${inlineMathContent}` },
  {
    role: "assistant" as const,
    content: `${codeContent}\n\n${blockMathContent}\n\n${imageContent}\n\n${unsafeImageContent}`
  }
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

  it("keeps CJK titles in export filenames", () => {
    // An ASCII-only slug erased the whole title, so every Chinese-titled
    // conversation downloaded as the same "conversation.md".
    expect(
      exportConversation({ title: "架构讨论：微服务拆分", messages, format: "markdown" }).filename
    ).toBe("架构讨论：微服务拆分.md");

    // Path separators and other reserved characters are still replaced.
    expect(exportConversation({ title: 'a/b\\c "d"', messages, format: "markdown" }).filename).toBe(
      "a-b-c-d.md"
    );

    // A title with nothing usable left still falls back.
    expect(exportConversation({ title: "///", messages, format: "markdown" }).filename).toBe(
      "conversation.md"
    );
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

  it("exports Notion blocks as a JSON payload", () => {
    const exported = exportConversation({ title: "Demo Chat", messages, format: "notion" });

    expect(exported.filename).toBe("demo-chat.notion.json");
    expect(exported.mimeType).toBe("application/json");

    const payload = JSON.parse(exported.content as string) as { blocks: unknown[] };
    expect(Array.isArray(payload.blocks)).toBe(true);
    expect(payload.blocks.length).toBeGreaterThan(0);
  });
});

describe("export fidelity: Markdown and Obsidian", () => {
  const markdown = toMarkdown({ title: "Rich", messages: richMessages });
  const obsidian = exportConversation({ title: "Rich", messages: richMessages, format: "obsidian" })
    .content as string;

  for (const [name, output] of [
    ["markdown", markdown],
    ["obsidian", obsidian]
  ] as const) {
    it(`keeps fenced code blocks with language verbatim in ${name}`, () => {
      expect(output).toContain(codeContent);
    });

    it(`keeps tables verbatim in ${name}`, () => {
      expect(output).toContain(tableContent);
    });

    it(`keeps block and inline math verbatim in ${name}`, () => {
      expect(output).toContain(blockMathContent);
      expect(output).toContain("$E=mc^2$");
    });

    it(`keeps image references verbatim in ${name}`, () => {
      expect(output).toContain(imageContent);
    });
  }
});

describe("export fidelity: printable HTML / print-to-PDF", () => {
  const html = toPrintableHtml({ title: "Rich", messages: richMessages });

  it("renders fenced code in pre/code with its language and escaped content", () => {
    expect(html).toContain('<pre><code class="language-python">');
    expect(html).toContain("print(&quot;hi &gt; there&quot;)");
  });

  it("renders Markdown tables as real table markup", () => {
    expect(html).toContain("<table><thead><tr><th>Name</th><th>Score</th></tr></thead>");
    expect(html).toContain("<td>Ada</td><td>100</td>");
    expect(html).toContain("<td>Bob</td><td>42</td>");
    expect(html).not.toContain("| Name | Score |");
  });

  it("keeps math as literal TeX text", () => {
    expect(html).toContain("\\int_0^1 x\\,dx = \\frac{1}{2}");
    expect(html).toContain("$E=mc^2$");
  });

  it("renders http(s) images as img tags and drops unsafe schemes", () => {
    expect(html).toContain('<img src="https://example.com/diagram.png" alt="diagram">');
    expect(html).not.toContain("file:///etc/passwd");
    expect(html).toContain("[image: leak]");
  });

  it("stays script-free with escaped user content", () => {
    const hostile = toPrintableHtml({
      title: "Rich",
      messages: [
        { role: "user" as const, content: "<script>alert(1)</script> ![x](javascript:alert(1))" }
      ]
    });

    expect(hostile).not.toContain("<script>alert");
    expect(hostile).not.toContain('src="javascript:');
  });

  it("keeps CJK content intact for the print path (the old byte-PDF mangled it)", () => {
    const html = toPrintableHtml({
      title: "中文对话",
      messages: [{ role: "user" as const, content: "回答代码问题时优先用 TypeScript" }]
    });

    expect(html).toContain("中文对话");
    expect(html).toContain("回答代码问题时优先用 TypeScript");
  });
});

describe("markdown block parser", () => {
  it("parses the four fidelity content kinds", () => {
    const blocks = parseMarkdownBlocks(
      `${codeContent}\n\n${tableContent}\n\n${blockMathContent}\n\n${imageContent}`
    );

    expect(blocks.map((block) => block.kind)).toEqual(["code", "table", "equation", "image"]);
  });

  it("handles escaped pipes inside table cells", () => {
    const blocks = parseMarkdownBlocks("| a | b |\n| --- | --- |\n| x \\| y | z |");

    expect(blocks[0]).toEqual({
      kind: "table",
      rows: [
        ["a", "b"],
        ["x | y", "z"]
      ]
    });
  });

  it("recovers from an unterminated fence without dropping content", () => {
    const blocks = parseMarkdownBlocks("```js\nconst a = 1;");

    expect(blocks).toEqual([{ kind: "code", language: "js", code: "const a = 1;" }]);
  });
});

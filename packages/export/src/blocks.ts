/**
 * Minimal Markdown block parser shared by the printable-HTML renderer and the
 * Notion block converter. It only understands the constructs the export
 * fidelity pass cares about (spec §6.2): fenced code, tables, block math,
 * images, headings, and plain paragraphs. Everything else stays verbatim
 * inside paragraph text so no content is ever lost.
 */

export type ParsedBlock =
  | { kind: "code"; language: string; code: string }
  | { kind: "equation"; expression: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "image"; url: string; alt: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string };

const FENCE_OPEN = /^\s*```(.*)$/;
const FENCE_CLOSE = /^\s*```\s*$/;
const MATH_SINGLE_LINE = /^\s*\$\$(.+?)\$\$\s*$/;
const MATH_FENCE = /^\s*\$\$\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/;
const STANDALONE_IMAGE = /^\s*!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;

export function parseMarkdownBlocks(markdown: string): ParsedBlock[] {
  const lines = markdown.split("\n");
  const blocks: ParsedBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    const text = paragraph.join("\n").trim();
    if (text) {
      blocks.push({ kind: "paragraph", text });
    }
    paragraph = [];
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";

    const fence = FENCE_OPEN.exec(line);
    if (fence) {
      flushParagraph();
      const language = ((fence[1] ?? "").trim().split(/\s+/)[0] ?? "").toLowerCase();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE_CLOSE.test(lines[index] ?? "")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      index += 1; // skip the closing fence (no-op at EOF)
      blocks.push({ kind: "code", language, code: code.join("\n") });
      continue;
    }

    const singleLineMath = MATH_SINGLE_LINE.exec(line);
    if (singleLineMath) {
      flushParagraph();
      blocks.push({ kind: "equation", expression: (singleLineMath[1] ?? "").trim() });
      index += 1;
      continue;
    }

    if (MATH_FENCE.test(line)) {
      flushParagraph();
      const expression: string[] = [];
      index += 1;
      while (index < lines.length && !MATH_FENCE.test(lines[index] ?? "")) {
        expression.push(lines[index] ?? "");
        index += 1;
      }
      index += 1; // skip the closing $$ (no-op at EOF)
      blocks.push({ kind: "equation", expression: expression.join("\n").trim() });
      continue;
    }

    if (
      TABLE_ROW.test(line) &&
      index + 1 < lines.length &&
      TABLE_SEPARATOR.test(lines[index + 1] ?? "")
    ) {
      flushParagraph();
      const rows: string[][] = [splitTableRow(line)];
      index += 2; // header + separator
      while (index < lines.length && TABLE_ROW.test(lines[index] ?? "")) {
        rows.push(splitTableRow(lines[index] ?? ""));
        index += 1;
      }
      blocks.push({ kind: "table", rows });
      continue;
    }

    const image = STANDALONE_IMAGE.exec(line);
    if (image) {
      flushParagraph();
      blocks.push({ kind: "image", alt: image[1] ?? "", url: image[2] ?? "" });
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({
        kind: "heading",
        level: (heading[1] ?? "#").length,
        text: (heading[2] ?? "").trim()
      });
      index += 1;
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      index += 1;
      continue;
    }

    paragraph.push(line);
    index += 1;
  }

  flushParagraph();
  return blocks;
}

const ESCAPED_PIPE_SENTINEL = "\u0000";

function splitTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner
    .replaceAll("\\|", ESCAPED_PIPE_SENTINEL)
    .split("|")
    .map((cell) => cell.replaceAll(ESCAPED_PIPE_SENTINEL, "|").trim());
}

export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function isSafeImageUrl(url: string): boolean {
  return isHttpUrl(url) || /^data:image\//i.test(url);
}

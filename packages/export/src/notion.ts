/**
 * Pure conversion from an exported conversation to Notion API block objects
 * (spec §6.2, Notion target). No network calls and no OAuth here — the
 * extension pushes the returned blocks with the user's own Notion token.
 */

import type { ConversationMessage } from "@gotomemory/contracts";

import { isHttpUrl, parseMarkdownBlocks, type ParsedBlock } from "./blocks.js";

/** Notion caps every rich_text text.content at 2000 characters. */
export const NOTION_RICH_TEXT_LIMIT = 2000;

export interface NotionRichText {
  type: "text";
  text: { content: string; link: { url: string } | null };
}

export interface NotionParagraphBlock {
  object: "block";
  type: "paragraph";
  paragraph: { rich_text: NotionRichText[] };
}

export interface NotionHeading1Block {
  object: "block";
  type: "heading_1";
  heading_1: { rich_text: NotionRichText[] };
}

export interface NotionHeading2Block {
  object: "block";
  type: "heading_2";
  heading_2: { rich_text: NotionRichText[] };
}

export interface NotionHeading3Block {
  object: "block";
  type: "heading_3";
  heading_3: { rich_text: NotionRichText[] };
}

export interface NotionCodeBlock {
  object: "block";
  type: "code";
  code: { rich_text: NotionRichText[]; language: string };
}

export interface NotionEquationBlock {
  object: "block";
  type: "equation";
  equation: { expression: string };
}

export interface NotionImageBlock {
  object: "block";
  type: "image";
  image: { type: "external"; external: { url: string } };
}

export interface NotionTableRowBlock {
  object: "block";
  type: "table_row";
  table_row: { cells: NotionRichText[][] };
}

export interface NotionTableBlock {
  object: "block";
  type: "table";
  table: {
    table_width: number;
    has_column_header: boolean;
    has_row_header: boolean;
    children: NotionTableRowBlock[];
  };
}

export type NotionBlock =
  | NotionParagraphBlock
  | NotionHeading1Block
  | NotionHeading2Block
  | NotionHeading3Block
  | NotionCodeBlock
  | NotionEquationBlock
  | NotionImageBlock
  | NotionTableBlock;

/** Code languages accepted by the Notion API `code` block. */
const NOTION_CODE_LANGUAGES = new Set([
  "abap",
  "arduino",
  "bash",
  "basic",
  "c",
  "clojure",
  "coffeescript",
  "c++",
  "c#",
  "css",
  "dart",
  "diff",
  "docker",
  "elixir",
  "elm",
  "erlang",
  "flow",
  "fortran",
  "f#",
  "gherkin",
  "glsl",
  "go",
  "graphql",
  "groovy",
  "haskell",
  "html",
  "java",
  "javascript",
  "json",
  "julia",
  "kotlin",
  "latex",
  "less",
  "lisp",
  "livescript",
  "lua",
  "makefile",
  "markdown",
  "markup",
  "matlab",
  "mermaid",
  "nix",
  "objective-c",
  "ocaml",
  "pascal",
  "perl",
  "php",
  "plain text",
  "powershell",
  "prolog",
  "protobuf",
  "python",
  "r",
  "reason",
  "ruby",
  "rust",
  "sass",
  "scala",
  "scheme",
  "scss",
  "shell",
  "sql",
  "swift",
  "typescript",
  "vb.net",
  "verilog",
  "vhdl",
  "visual basic",
  "webassembly",
  "xml",
  "yaml"
]);

const NOTION_LANGUAGE_ALIASES: Record<string, string> = {
  cjs: "javascript",
  cpp: "c++",
  cs: "c#",
  csharp: "c#",
  dockerfile: "docker",
  golang: "go",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  mjs: "javascript",
  objc: "objective-c",
  objectivec: "objective-c",
  ps1: "powershell",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "shell",
  tex: "latex",
  text: "plain text",
  ts: "typescript",
  tsx: "typescript",
  txt: "plain text",
  yml: "yaml",
  zsh: "shell"
};

export function toNotionCodeLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (!normalized) {
    return "plain text";
  }
  const resolved = NOTION_LANGUAGE_ALIASES[normalized] ?? normalized;
  return NOTION_CODE_LANGUAGES.has(resolved) ? resolved : "plain text";
}

/** Splits text into Notion rich_text objects honoring the 2000-char limit. */
export function toNotionRichText(text: string): NotionRichText[] {
  const chunks: NotionRichText[] = [];
  for (let offset = 0; offset < text.length; offset += NOTION_RICH_TEXT_LIMIT) {
    chunks.push({
      type: "text",
      text: { content: text.slice(offset, offset + NOTION_RICH_TEXT_LIMIT), link: null }
    });
  }
  return chunks;
}

export function conversationToNotionBlocks(input: {
  title: string;
  messages: ConversationMessage[];
}): NotionBlock[] {
  const blocks: NotionBlock[] = [
    { object: "block", type: "heading_1", heading_1: { rich_text: toNotionRichText(input.title) } }
  ];

  for (const message of input.messages) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: toNotionRichText(roleLabel(message.role)) }
    });
    for (const parsed of parseMarkdownBlocks(message.content)) {
      blocks.push(parsedBlockToNotion(parsed));
    }
  }

  return blocks;
}

/** Notion's `blocks.children.append` endpoint accepts at most 100 block objects per call. */
export const NOTION_BLOCKS_PER_APPEND = 100;

/**
 * Split a flat block list into call-sized chunks for `blocks.children.append`.
 * `conversationToNotionBlocks` returns one flat array with no such limit
 * (a long conversation easily exceeds 100 blocks); a real push to the Notion
 * API must issue one append call per chunk, in order, against the same parent.
 */
export function chunkNotionBlocks(
  blocks: NotionBlock[],
  size: number = NOTION_BLOCKS_PER_APPEND
): NotionBlock[][] {
  const chunks: NotionBlock[][] = [];
  for (let offset = 0; offset < blocks.length; offset += size) {
    chunks.push(blocks.slice(offset, offset + size));
  }
  return chunks;
}

function parsedBlockToNotion(block: ParsedBlock): NotionBlock {
  switch (block.kind) {
    case "code":
      return {
        object: "block",
        type: "code",
        code: {
          rich_text: toNotionRichText(block.code),
          language: toNotionCodeLanguage(block.language)
        }
      };
    case "equation":
      return { object: "block", type: "equation", equation: { expression: block.expression } };
    case "table":
      return tableBlock(block.rows);
    case "image":
      if (isHttpUrl(block.url)) {
        return {
          object: "block",
          type: "image",
          image: { type: "external", external: { url: block.url } }
        };
      }
      // Notion external images require a public http(s) URL; keep a textual trace.
      return paragraphBlock(`[image: ${block.alt || block.url}]`);
    case "heading":
      // The role marker owns heading_2; nested content headings become heading_3.
      return {
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: toNotionRichText(block.text) }
      };
    case "paragraph":
      return paragraphBlock(block.text);
  }
}

function paragraphBlock(text: string): NotionParagraphBlock {
  return { object: "block", type: "paragraph", paragraph: { rich_text: toNotionRichText(text) } };
}

function tableBlock(rows: string[][]): NotionTableBlock {
  const width = Math.max(1, ...rows.map((row) => row.length));
  const children: NotionTableRowBlock[] = rows.map((row) => ({
    object: "block",
    type: "table_row",
    table_row: {
      cells: Array.from({ length: width }, (_, column) => toNotionRichText(row[column] ?? ""))
    }
  }));

  return {
    object: "block",
    type: "table",
    table: {
      table_width: width,
      has_column_header: true,
      has_row_header: false,
      children
    }
  };
}

function roleLabel(role: ConversationMessage["role"]): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

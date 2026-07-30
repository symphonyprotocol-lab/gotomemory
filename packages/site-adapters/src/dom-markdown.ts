/**
 * Structure-preserving DOM→Markdown serialization for captured messages
 * (spec §6.2: 代码块 / 表格 / 公式 / 图片的保真度是导出的核心竞争力).
 *
 * The assistant sites render Markdown to HTML, so `textContent` loses every
 * structural marker (fences, table pipes, TeX delimiters) and absorbs in-message
 * UI chrome ("Copy code" buttons, language labels, icon ligature text). This
 * walker re-serializes the rendered DOM back to Markdown so the export pipeline
 * (`parseMarkdownBlocks` and friends) receives real structure:
 *
 *   - <pre> → fenced code with the language from `class="language-x"`; only the
 *     inner <code> text is taken, which drops header/copy chrome living inside
 *     the <pre> wrapper on ChatGPT/Claude/Gemini.
 *   - <table> → pipe tables (pipes escaped, newlines flattened per cell).
 *   - KaTeX (.katex / .katex-display) → `$…$` / `$$…$$` from the TeX source in
 *     `<annotation encoding="application/x-tex">`.
 *   - <img> → `![alt](url)`; <a> → `[text](url)` for http(s) targets.
 *   - Headings, lists (nested), blockquotes, hr, bold/italic/strike/inline code.
 *   - Buttons, icons, sr-only and aria-hidden nodes are skipped as UI chrome.
 *
 * Unknown elements (including the sites' custom elements) are treated as plain
 * containers, so content is never dropped — worst case it degrades to the text
 * it would have had before.
 */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** Pure UI chrome by tag — never message content. */
const SKIPPED_TAGS = new Set([
  "button",
  "svg",
  "style",
  "script",
  "noscript",
  "template",
  "select",
  "option",
  "input",
  "textarea",
  "audio",
  "video",
  "canvas",
  "iframe",
  "dialog",
  // Google Material icons render their glyph name as text ("content_copy").
  "mat-icon"
]);

const SKIPPED_ROLES = new Set(["button", "menu", "menubar", "toolbar", "tooltip", "dialog"]);

/** Tags serialized inside a paragraph rather than as their own block. */
const INLINE_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "br",
  "cite",
  "code",
  "data",
  "del",
  "dfn",
  "em",
  "i",
  "img",
  "ins",
  "kbd",
  "mark",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var",
  "wbr"
]);

interface WalkContext {
  /** Keep single newlines (ChatGPT/Claude user bubbles use white-space:pre-wrap). */
  preserveNewlines: boolean;
  /** Container-nesting depth (incremented once per collectBlocks/inlineChildren entry). */
  depth: number;
}

/**
 * Hard cap on container-nesting depth. Real message DOMs (even heavily nested
 * ones — blockquotes-in-lists-in-tables) stay well under this; it exists only
 * to stop a pathological or adversarial DOM from recursing until the call
 * stack overflows, which would otherwise throw out of `extractMessages` and
 * kill the whole capture pass rather than just this one element.
 */
const MAX_WALK_DEPTH = 300;

/**
 * Serialize a captured message element to Markdown. Returns "" when nothing
 * remains after dropping UI chrome (callers fall back to `textContent`).
 */
export function serializeElementToMarkdown(element: Element): string {
  return collectBlocks(element, contextFor(element, { preserveNewlines: false, depth: 0 }))
    .join("\n\n")
    .trim();
}

function contextFor(element: Element, parent: WalkContext): WalkContext {
  const classAttr = element.getAttribute?.("class") ?? "";
  const preserveNewlines =
    classAttr.includes("whitespace-pre-wrap") && !parent.preserveNewlines
      ? true
      : parent.preserveNewlines;
  return { preserveNewlines, depth: parent.depth + 1 };
}

function shouldSkip(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (SKIPPED_TAGS.has(tag)) {
    return true;
  }
  if (element.getAttribute("aria-hidden") === "true" || element.hasAttribute("hidden")) {
    return true;
  }
  const role = element.getAttribute("role");
  if (role && SKIPPED_ROLES.has(role)) {
    return true;
  }
  return (element.getAttribute("class") ?? "").includes("sr-only");
}

/** KaTeX keeps the original TeX source in a MathML annotation; use it verbatim. */
function katexToMarkdown(element: Element): { text: string; display: boolean } | null {
  const classAttr = element.getAttribute("class") ?? "";
  const isDisplay = /\bkatex-display\b/.test(classAttr) || /\bmath-display\b/.test(classAttr);
  if (!isDisplay && !/\bkatex\b/.test(classAttr) && !/\bmath-inline\b/.test(classAttr)) {
    return null;
  }
  const tex =
    element.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() ||
    element.textContent?.trim() ||
    "";
  if (!tex) {
    return null;
  }
  return isDisplay
    ? { text: `$$\n${tex}\n$$`, display: true }
    : { text: `$${tex}$`, display: false };
}

/** Walk a container, emitting completed Markdown blocks. */
function collectBlocks(container: Element, parentCtx: WalkContext): string[] {
  const ctx = contextFor(container, parentCtx);
  if (ctx.depth > MAX_WALK_DEPTH) {
    const text = (container.textContent ?? "").trim();
    return text ? [text] : [];
  }
  const blocks: string[] = [];
  let inline: string[] = [];

  const flush = (): void => {
    const text = finishInline(inline, ctx);
    if (text) {
      blocks.push(text);
    }
    inline = [];
  };

  for (const child of Array.from(container.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      inline.push(collapseText((child as CharacterData).data, ctx));
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) {
      continue;
    }
    const element = child as Element;
    if (shouldSkip(element)) {
      continue;
    }

    const katex = katexToMarkdown(element);
    if (katex) {
      if (katex.display) {
        flush();
        blocks.push(katex.text);
      } else {
        inline.push(katex.text);
      }
      continue;
    }

    const tag = element.tagName.toLowerCase();
    if (INLINE_TAGS.has(tag)) {
      inline.push(serializeInlineElement(element, ctx));
      continue;
    }

    flush();
    blocks.push(...serializeBlockElement(element, ctx));
  }

  flush();
  return blocks.filter(Boolean);
}

function serializeBlockElement(element: Element, ctx: WalkContext): string[] {
  const tag = element.tagName.toLowerCase();
  switch (tag) {
    case "pre":
      return [fencedCode(element)];
    case "table":
      return [pipeTable(element, ctx)];
    case "ul":
    case "ol":
      return [listMarkdown(element, ctx)];
    case "blockquote": {
      const inner = collectBlocks(element, ctx).join("\n\n");
      return inner
        ? [
            inner
              .split("\n")
              .map((line) => (line ? `> ${line}` : ">"))
              .join("\n")
          ]
        : [];
    }
    case "hr":
      return ["---"];
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const text = inlineContent(element, ctx);
      return text ? [`${"#".repeat(Number(tag[1]))} ${text}`] : [];
    }
    default:
      // p, div, li wrappers, <code-block> and other custom elements: plain
      // containers — recurse so nothing inside is lost.
      return collectBlocks(element, ctx);
  }
}

/**
 * <pre> → fenced code. Only the inner <code> text is used when present: on all
 * three sites the language label and copy button live inside the <pre> wrapper
 * but outside <code>, so this single rule strips that chrome.
 */
function fencedCode(pre: Element): string {
  const code = pre.querySelector("code");
  const raw = (code ?? pre).textContent ?? "";
  const text = raw.replace(/\n$/, "");
  const language =
    /(?:^|\s)language-([A-Za-z0-9#+.-]+)/.exec(
      `${code?.getAttribute("class") ?? ""} ${pre.getAttribute("class") ?? ""}`
    )?.[1] ?? "";
  const longestRun = Math.max(2, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${language.toLowerCase()}\n${text}\n${fence}`;
}

function pipeTable(table: Element, ctx: WalkContext): string {
  const rows = Array.from(table.querySelectorAll("tr")).filter(
    (row) => row.closest("table") === table
  );
  if (rows.length === 0) {
    return inlineContent(table, ctx);
  }

  const cellsOf = (row: Element): string[] =>
    Array.from(row.children)
      .filter((cell) => /^(td|th)$/i.test(cell.tagName))
      .map((cell) => inlineContent(cell, ctx).replace(/\n+/g, " ").replaceAll("|", "\\|").trim());

  const header = cellsOf(rows[0]!);
  const width = Math.max(header.length, 1);
  const line = (cells: string[]): string =>
    `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;

  return [
    line(header),
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...rows.slice(1).map((row) => line(cellsOf(row)))
  ].join("\n");
}

function listMarkdown(list: Element, ctx: WalkContext, depth = 0): string {
  const ordered = list.tagName.toLowerCase() === "ol";
  const start = Number.parseInt(list.getAttribute("start") ?? "1", 10) || 1;
  const indent = "  ".repeat(depth);
  const lines: string[] = [];

  const items = Array.from(list.children).filter((child) => child.tagName.toLowerCase() === "li");
  items.forEach((item, index) => {
    const marker = ordered ? `${start + index}. ` : "- ";
    // Serialize the item's own content and nested lists separately so nesting
    // indents correctly regardless of how the site wraps the text.
    const nestedLists = Array.from(item.children).filter((child) =>
      /^(ul|ol)$/i.test(child.tagName)
    );
    const clone = item.cloneNode(true) as Element;
    for (const nested of Array.from(clone.children)) {
      if (/^(ul|ol)$/i.test(nested.tagName)) {
        nested.remove();
      }
    }
    const own = collectBlocks(clone, ctx).join("\n");
    const ownLines = (own || "").split("\n");
    lines.push(`${indent}${marker}${ownLines[0] ?? ""}`);
    for (const continuation of ownLines.slice(1)) {
      lines.push(`${indent}${" ".repeat(marker.length)}${continuation}`);
    }
    for (const nested of nestedLists) {
      lines.push(listMarkdown(nested, ctx, depth + 1));
    }
  });

  return lines.join("\n");
}

/** Serialize an element's contents as a single inline string. */
function inlineContent(element: Element, ctx: WalkContext): string {
  return finishInline(inlineChildren(element, ctx), ctx);
}

function inlineChildren(element: Element, parentCtx: WalkContext): string[] {
  const ctx = contextFor(element, parentCtx);
  if (ctx.depth > MAX_WALK_DEPTH) {
    const text = (element.textContent ?? "").trim();
    return text ? [text] : [];
  }
  const parts: string[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      parts.push(collapseText((child as CharacterData).data, ctx));
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) {
      continue;
    }
    const el = child as Element;
    if (shouldSkip(el)) {
      continue;
    }
    const katex = katexToMarkdown(el);
    if (katex) {
      parts.push(katex.display ? katex.text : katex.text);
      continue;
    }
    parts.push(serializeInlineElement(el, ctx));
  }
  return parts;
}

function serializeInlineElement(element: Element, ctx: WalkContext): string {
  const tag = element.tagName.toLowerCase();
  switch (tag) {
    case "br":
      return "\n";
    case "img": {
      const src = element.getAttribute("src") ?? "";
      if (!/^(https?:|data:image\/)/i.test(src) || src.includes(")")) {
        return "";
      }
      const alt = (element.getAttribute("alt") ?? "").replace(/[[\]]/g, "");
      return `![${alt}](${src})`;
    }
    case "a": {
      const inner = inlineContent(element, ctx);
      const href = element.getAttribute("href") ?? "";
      return /^https?:\/\//i.test(href) && inner && !href.includes(")")
        ? `[${inner}](${href})`
        : inner;
    }
    case "strong":
    case "b": {
      const inner = inlineContent(element, ctx);
      return inner ? `**${inner}**` : "";
    }
    case "em":
    case "i": {
      const inner = inlineContent(element, ctx);
      return inner ? `*${inner}*` : "";
    }
    case "del":
    case "s":
    case "strike": {
      const inner = inlineContent(element, ctx);
      return inner ? `~~${inner}~~` : "";
    }
    case "code": {
      const text = element.textContent ?? "";
      if (!text) {
        return "";
      }
      const longestRun = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
      const ticks = "`".repeat(longestRun + 1);
      return longestRun > 0 ? `${ticks} ${text} ${ticks}` : `${ticks}${text}${ticks}`;
    }
    default:
      return inlineContent(element, ctx);
  }
}

function collapseText(text: string, ctx: WalkContext): string {
  return ctx.preserveNewlines ? text.replace(/[ \t]+/g, " ") : text.replace(/\s+/g, " ");
}

/** Join inline fragments into a paragraph, tidying whitespace around breaks. */
function finishInline(parts: string[], ctx: WalkContext): string {
  const joined = parts.join("");
  const lines = joined
    .split("\n")
    .map((line) => (ctx.preserveNewlines ? line.trim() : line.replace(/ {2,}/g, " ").trim()));
  // Collapse leading/trailing blank lines but keep intentional inner breaks.
  while (lines.length > 0 && !lines[0]) {
    lines.shift();
  }
  while (lines.length > 0 && !lines.at(-1)) {
    lines.pop();
  }
  return lines.join("\n");
}

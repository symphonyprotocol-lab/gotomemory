import type { ConversationMessage, Platform } from "@gotomemory/contracts";

import { serializeElementToMarkdown } from "./dom-markdown.js";

export * from "./overrides.js";
export { serializeElementToMarkdown } from "./dom-markdown.js";

export interface SiteAdapter {
  platform: Platform;
  host: string;
  messageSelector: string;
  inputSelector: string;
  mountSelector: string;
  conversationPattern: RegExp;
  extractMessages(root?: ParentNode): ConversationMessage[];
  insertIntoPrompt(text: string, root?: ParentNode): boolean;
  /** Remove a previously-inserted block from the composer (trust-mode undo). */
  removeFromPrompt(text: string, root?: ParentNode): boolean;
  findMount(root?: ParentNode): Element | null;
  /** Stable id of the open conversation, parsed from its URL (null on a new/blank chat). */
  conversationId(url?: string): string | null;
}

// inputSelector is a PRIORITY LIST: comma-separated alternatives are tried in
// order and the first one with a visible match wins (see findComposer). The
// real composer anchor comes first; the generic editable/textarea fallbacks
// exist so a redesign degrades to "probably right" instead of "broken" — the
// remote override channel can then ship a precise selector without a review
// cycle. Alternatives must not themselves contain commas (e.g. :is(a, b)).
export const adapters: Record<Platform, SiteAdapter> = {
  chatgpt: createAdapter({
    platform: "chatgpt",
    host: "chatgpt.com",
    messageSelector: "[data-message-author-role]",
    inputSelector: "#prompt-textarea, textarea, [contenteditable='true']",
    mountSelector: "main",
    conversationPattern: /\/c\/([^/?#]+)/
  }),
  claude: createAdapter({
    platform: "claude",
    host: "claude.ai",
    // Claude's assistant answer is `.font-claude-response`; `[data-is-streaming]`
    // is the surrounding turn wrapper (it also holds the user message, so the
    // "innermost element" filter drops it). Keep both plus legacy names for
    // version resilience — the filter resolves to the clean inner elements.
    messageSelector:
      "[data-testid='user-message'], [data-testid='assistant-message'], .font-claude-response, .font-claude-message, [data-is-streaming]",
    inputSelector: "[contenteditable='true'].ProseMirror, [contenteditable='true'], textarea",
    mountSelector: "main",
    conversationPattern: /\/chat\/([^/?#]+)/
  }),
  gemini: createAdapter({
    platform: "gemini",
    host: "gemini.google.com",
    messageSelector: "user-query, model-response, [data-message-role]",
    inputSelector: "rich-textarea [contenteditable='true'], [contenteditable='true'], textarea",
    mountSelector: "main",
    conversationPattern: /\/app\/([^/?#]+)/
  })
};

export function getAdapterForUrl(url: string): SiteAdapter | undefined {
  const host = new URL(url).host;
  return Object.values(adapters).find(
    (adapter) => host === adapter.host || host.endsWith(`.${adapter.host}`)
  );
}

function createAdapter(
  config: Omit<
    SiteAdapter,
    "extractMessages" | "insertIntoPrompt" | "removeFromPrompt" | "findMount" | "conversationId"
  >
): SiteAdapter {
  // Methods read selectors off the adapter object (not the captured config), so
  // remotely-delivered selector overrides applied after creation take effect
  // (spec: monorepo §7 选择器远程配置).
  const adapter: SiteAdapter = {
    ...config,
    extractMessages(root: ParentNode = document) {
      let matched: Element[];
      try {
        matched = Array.from(root.querySelectorAll(adapter.messageSelector));
      } catch {
        // An invalid selector (e.g. a bad remote override) must fail open to no
        // messages for this pass, not throw and kill the caller's whole capture
        // tick (auto-capture, whole-conversation collection, inject-relevance).
        return [];
      }
      // When selectors match both a wrapper and its inner message, keep only the
      // innermost element so we get clean text without duplicates or UI chrome.
      const innermost = matched.filter(
        (element) => !matched.some((other) => other !== element && element.contains(other))
      );
      return innermost
        .map((element) => {
          try {
            return toMessage(config.platform, element);
          } catch {
            // One malformed message element (adversarial or pathological DOM)
            // must not drop every other message in the pass.
            return undefined;
          }
        })
        .filter((message): message is ConversationMessage => Boolean(message));
    },
    insertIntoPrompt(text: string, root: ParentNode = document) {
      const input = findComposer(adapter.inputSelector, root);
      if (!input) {
        return false;
      }

      input.focus?.();
      const doc = input.ownerDocument ?? document;

      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        const end = input.value.length;
        try {
          input.setSelectionRange(end, end);
        } catch {
          // some input types don't support selection ranges
        }
        // Keep the blank-line separator between existing text and the insert on
        // both paths, so the caret-insert result matches the appendText fallback.
        if (execInsert(doc, input.value ? `\n\n${text}` : text)) {
          return true;
        }
        setNativeValue(input, appendText(input.value, text));
        input.dispatchEvent(
          new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })
        );
        return true;
      }

      if (isContentEditableElement(input)) {
        // ChatGPT/Claude use rich-text editors (ProseMirror/Lexical) that ignore
        // direct textContent writes. execCommand goes through their input
        // pipeline; fall back to textContent for plain contenteditables.
        placeCaretAtEnd(doc, input);
        const existing = input.textContent ?? "";
        if (execInsert(doc, existing ? `\n\n${text}` : text)) {
          return true;
        }
        input.textContent = appendText(existing, text);
        input.dispatchEvent(
          new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })
        );
        return true;
      }

      return false;
    },
    removeFromPrompt(text: string, root: ParentNode = document) {
      const input = findComposer(adapter.inputSelector, root);
      if (!input || !text) {
        return false;
      }
      const doc = input.ownerDocument ?? document;

      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        if (!input.value.includes(text)) {
          return false;
        }
        setNativeValue(input, stripInsertedBlock(input.value, text));
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContent" }));
        return true;
      }

      if (isContentEditableElement(input)) {
        // Rich editors render inserted "\n" as element boundaries (<br>, block
        // splits) that vanish from textContent, so a verbatim string match can
        // never find the block again (observed live on the execCommand path).
        // Match whitespace-insensitively over the text nodes and delete the
        // exact range through the editor's own pipeline.
        if (!removeBlockFromEditable(doc, input, text)) {
          return false;
        }
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContent" }));
        return true;
      }

      return false;
    },
    findMount(root: ParentNode = document) {
      try {
        return root.querySelector(adapter.mountSelector);
      } catch {
        // Same rationale as extractMessages: an invalid mountSelector (bad
        // remote override) must fail open, not throw.
        return null;
      }
    },
    conversationId(url: string = location.href) {
      try {
        const { pathname } = new URL(url);
        return config.conversationPattern.exec(pathname)?.[1] ?? null;
      } catch {
        return null;
      }
    }
  };
  return adapter;
}

function toMessage(platform: Platform, element: Element): ConversationMessage | undefined {
  const explicitRole =
    element.getAttribute("data-message-author-role") ?? element.getAttribute("data-message-role");
  const role =
    explicitRole === "user" || explicitRole === "assistant"
      ? explicitRole
      : inferRoleFromElement(platform, element);
  // Markdown-preserving serialization (fences/tables/TeX survive; UI chrome is
  // dropped). Fall back to raw text if the walker yields nothing so an unknown
  // DOM shape can never lose a message outright.
  const content = serializeElementToMarkdown(element) || element.textContent?.trim();

  if (!role || !content) {
    return undefined;
  }

  return { role, content, timestamp: parseElementTimestamp(element) };
}

/** Best-effort message time from the DOM (most chat UIs don't expose one → null). */
function parseElementTimestamp(element: Element): string | null {
  const raw =
    element.querySelector?.("time[datetime]")?.getAttribute("datetime") ??
    element.getAttribute?.("data-timestamp") ??
    null;
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function inferRoleFromElement(
  platform: Platform,
  element: Element
): ConversationMessage["role"] | undefined {
  if (platform === "claude") {
    const testId = element.getAttribute("data-testid");
    if (testId === "user-message") {
      return "user";
    }
    if (
      testId === "assistant-message" ||
      element.classList.contains("font-claude-response") ||
      element.classList.contains("font-claude-message") ||
      element.hasAttribute("data-is-streaming")
    ) {
      return "assistant";
    }
  }

  if (platform === "gemini") {
    if (element.tagName.toLocaleLowerCase() === "user-query") {
      return "user";
    }
    if (element.tagName.toLocaleLowerCase() === "model-response") {
      return "assistant";
    }
  }

  return undefined;
}

function appendText(existing: string, text: string): string {
  return existing ? `${existing}\n\n${text}` : text;
}

/** Remove an inserted block plus the blank-line separator insertIntoPrompt added. */
function stripInsertedBlock(existing: string, text: string): string {
  return existing.includes(`\n\n${text}`)
    ? existing.replace(`\n\n${text}`, "")
    : existing.replace(text, "").replace(/^\n+/, "");
}

/**
 * Resolve the composer for an inputSelector, treating the comma-separated
 * alternatives as a priority list: the first alternative with a visible match
 * wins, so a page-level generic like `[contenteditable='true']` serves as
 * fallback without hijacking insertion from the real composer (login pages and
 * side panels routinely contain stray editables). When nothing is visible
 * (degraded pages, jsdom), falls back to the highest-priority match at all.
 */
export function findComposer(
  inputSelector: string,
  root: ParentNode = document
): HTMLElement | null {
  let hidden: HTMLElement | null = null;
  for (const part of inputSelector.split(",")) {
    const selector = part.trim();
    if (!selector) {
      continue;
    }
    let candidates: HTMLElement[];
    try {
      candidates = Array.from(root.querySelectorAll(selector)).filter(
        (element): element is HTMLElement => element instanceof HTMLElement
      );
    } catch {
      // One invalid alternative (e.g. from a remote override) must not
      // invalidate the rest of the priority list.
      continue;
    }
    const visible = candidates.find(isVisible);
    if (visible) {
      return visible;
    }
    hidden ??= candidates[0] ?? null;
  }
  return hidden;
}

/**
 * Find `text` inside a contenteditable ignoring all whitespace (rich editors
 * re-render newlines as element boundaries), then delete that text-node range —
 * preferring execCommand("delete") so framework editors observe the change.
 */
function removeBlockFromEditable(doc: Document, root: HTMLElement, text: string): boolean {
  const target = text.replace(/\s+/g, "");
  if (!target) {
    return false;
  }

  // Map every non-whitespace character to its (text node, offset) position.
  const positions: Array<{ node: Text; offset: number }> = [];
  let flat = "";
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const data = (node as Text).data;
    for (let offset = 0; offset < data.length; offset += 1) {
      if (!/\s/.test(data[offset]!)) {
        flat += data[offset]!;
        positions.push({ node: node as Text, offset });
      }
    }
  }

  const startIndex = flat.indexOf(target);
  if (startIndex === -1) {
    return false;
  }
  const start = positions[startIndex]!;
  const end = positions[startIndex + target.length - 1]!;

  const range = doc.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset + 1);

  const selection = doc.defaultView?.getSelection?.();
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
    try {
      if (doc.execCommand("delete")) {
        return true;
      }
    } catch {
      // fall through to the direct range removal
    }
  }
  range.deleteContents();
  return true;
}

function isVisible(element: HTMLElement): boolean {
  return Boolean(element.offsetParent) || element.getClientRects().length > 0;
}

function isContentEditableElement(element: HTMLElement): boolean {
  if (element.isContentEditable) {
    return true;
  }
  const attr = element.getAttribute("contenteditable");
  return attr === "" || attr === "true" || attr === "plaintext-only";
}

/** Insert at the caret via the browser's editing pipeline (frameworks observe it). */
function execInsert(doc: Document, text: string): boolean {
  try {
    return doc.execCommand("insertText", false, text);
  } catch {
    return false;
  }
}

/** React/controlled inputs only react to the native value setter + input event. */
function setNativeValue(element: HTMLTextAreaElement | HTMLInputElement, value: string): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
}

function placeCaretAtEnd(doc: Document, element: HTMLElement): void {
  const selection = doc.defaultView?.getSelection?.();
  if (!selection) {
    return;
  }
  const range = doc.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

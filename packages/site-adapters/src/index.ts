import type { ConversationMessage, Platform } from "@gotomemory/contracts";

export interface SiteAdapter {
  platform: Platform;
  host: string;
  messageSelector: string;
  inputSelector: string;
  mountSelector: string;
  conversationPattern: RegExp;
  extractMessages(root?: ParentNode): ConversationMessage[];
  insertIntoPrompt(text: string, root?: ParentNode): boolean;
  findMount(root?: ParentNode): Element | null;
  /** Stable id of the open conversation, parsed from its URL (null on a new/blank chat). */
  conversationId(url?: string): string | null;
}

export const adapters: Record<Platform, SiteAdapter> = {
  chatgpt: createAdapter({
    platform: "chatgpt",
    host: "chatgpt.com",
    messageSelector: "[data-message-author-role]",
    inputSelector: "textarea, [contenteditable='true']",
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
    inputSelector: "[contenteditable='true'], textarea",
    mountSelector: "main",
    conversationPattern: /\/chat\/([^/?#]+)/
  }),
  gemini: createAdapter({
    platform: "gemini",
    host: "gemini.google.com",
    messageSelector: "user-query, model-response, [data-message-role]",
    inputSelector: "[contenteditable='true'], textarea",
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
  config: Omit<SiteAdapter, "extractMessages" | "insertIntoPrompt" | "findMount" | "conversationId">
): SiteAdapter {
  return {
    ...config,
    extractMessages(root: ParentNode = document) {
      const matched = Array.from(root.querySelectorAll(config.messageSelector));
      // When selectors match both a wrapper and its inner message, keep only the
      // innermost element so we get clean text without duplicates or UI chrome.
      const innermost = matched.filter(
        (element) => !matched.some((other) => other !== element && element.contains(other))
      );
      return innermost
        .map((element) => toMessage(config.platform, element))
        .filter((message): message is ConversationMessage => Boolean(message));
    },
    insertIntoPrompt(text: string, root: ParentNode = document) {
      // Prefer a visible composer: pages can hold stray/hidden inputs that would
      // otherwise be picked first and make insertion silently no-op.
      const candidates = Array.from(root.querySelectorAll(config.inputSelector)).filter(
        (element): element is HTMLElement => element instanceof HTMLElement
      );
      const input = candidates.find(isVisible) ?? candidates[0];
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
    findMount(root: ParentNode = document) {
      return root.querySelector(config.mountSelector);
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
}

function toMessage(platform: Platform, element: Element): ConversationMessage | undefined {
  const explicitRole =
    element.getAttribute("data-message-author-role") ?? element.getAttribute("data-message-role");
  const role =
    explicitRole === "user" || explicitRole === "assistant"
      ? explicitRole
      : inferRoleFromElement(platform, element);
  const content = element.textContent?.trim();

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

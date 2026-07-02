import type {
  ConversationMessage,
  Memory,
  Platform,
  SaveMemoryRequest
} from "@gotomemory/contracts";
import { formatAuthorizedMemoryPrompt } from "@gotomemory/core";
import {
  exportConversation,
  type ExportedConversation,
  type ExportFormat
} from "@gotomemory/export";
import { adapters, type SiteAdapter } from "@gotomemory/site-adapters";

import {
  createRuntimeMessenger,
  type ExtensionMessage,
  type ExtensionMessageResponse
} from "./messaging.js";

type Messenger = ReturnType<typeof createRuntimeMessenger>;

export interface MountOptions {
  root?: ParentNode;
  document?: Document;
  messenger?: Messenger;
}

export function mountContentScript(platform: Platform, options: MountOptions = {}): boolean {
  const doc = options.document ?? document;
  const root = options.root ?? doc;
  const messenger = options.messenger ?? createChromeMessenger();
  const adapter = adapters[platform];

  // The panel floats over the page (fixed-position, pinned to <body>) instead of
  // being nested in a site-specific node, so it survives SPA re-renders and is
  // not affected by — nor does it affect — the host page's layout. Shadow DOM
  // isolates its styles from ChatGPT/Claude/Gemini and vice versa.
  const host = doc.body ?? doc.documentElement;
  if (!host || host.querySelector?.("[data-gotomemory-panel]")) {
    return false;
  }

  host.append(buildPanel(doc, adapter, messenger, platform, root));
  return true;
}

/**
 * Real-page mounting helper for content scripts. The target SPAs
 * (ChatGPT/Claude/Gemini) render `main` after first paint and swap it on
 * client-side navigation, so a single mount attempt is unreliable. We keep
 * re-attempting on DOM changes; `mountContentScript` is idempotent (it bails
 * when the controls already exist), so this only re-adds the controls when a
 * route change has removed them. Returns a disposer that stops observing.
 */
export function autoMount(platform: Platform, options: MountOptions = {}): () => void {
  const doc = options.document ?? document;
  const tryMount = (): void => {
    mountContentScript(platform, options);
  };

  tryMount();

  const target = doc.body ?? doc.documentElement;
  if (!target || typeof MutationObserver === "undefined") {
    return () => {};
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    // Coalesce bursts of mutations into a single mount attempt.
    queueMicrotask(() => {
      scheduled = false;
      tryMount();
    });
  });
  observer.observe(target, { childList: true, subtree: true });
  return () => observer.disconnect();
}

/**
 * Build a save request that tags the memory with its conversation (id parsed
 * from the page URL, title from the document, link back to the thread). The
 * conversation id is what lets the background dedup re-imports and the sidebar
 * group memories by conversation.
 */
function buildSaveRequest(
  adapter: SiteAdapter,
  platform: Platform,
  message: ConversationMessage,
  root: ParentNode
): SaveMemoryRequest {
  const doc = documentOf(root);
  const url = doc?.location?.href ?? "";
  return {
    content: message.content,
    source: platform,
    role: message.role,
    conversation_id: adapter.conversationId(url),
    conversation_title: doc?.title?.trim() || null,
    source_url: url || null,
    created_at: message.timestamp ?? null
  };
}

function documentOf(root: ParentNode): Document | null {
  if (typeof Document !== "undefined" && root instanceof Document) {
    return root;
  }
  const owner = (root as { ownerDocument?: Document | null }).ownerDocument;
  return owner ?? (typeof document !== "undefined" ? document : null);
}

/**
 * Inject: ask the background for relevant memories for the current topic and
 * insert them, prompt-injection-framed, into the assistant input (spec §6.1, §9).
 * Private memories stay in `needs_confirm` and are not auto-injected.
 */
export async function injectRelevantMemories(
  adapter: SiteAdapter,
  messenger: Messenger,
  platform: Platform,
  root: ParentNode = document
): Promise<boolean> {
  // Relevance topic, best first: what you've typed but not sent, then your last
  // question, then the last message. The typed text targets the memory you want.
  const messages = adapter.extractMessages(root);
  const typed = readComposerText(adapter, root);
  const lastUser = [...messages].reverse().find((message) => message.role === "user")?.content;
  const topic = typed || lastUser || messages.at(-1)?.content || "";

  // Don't feed this conversation its own saved memories back into itself.
  const exclude_conversation_id = adapter.conversationId(documentOf(root)?.location?.href ?? "");
  const context = await messenger.context({ platform, topic, exclude_conversation_id });
  if (context.ready.length === 0) {
    return false;
  }

  return adapter.insertIntoPrompt(formatAuthorizedMemoryPrompt(context.ready), root);
}

function readComposerText(adapter: SiteAdapter, root: ParentNode): string {
  const element = root.querySelector?.(adapter.inputSelector) ?? null;
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return element.value.trim();
  }
  if (element instanceof HTMLElement) {
    return (element.textContent ?? "").trim();
  }
  return "";
}

/**
 * Bulk capture: save every message in the conversation DOM — both your
 * questions and the assistant's answers — each tagged with its role. Opening a
 * historical conversation renders its past messages, so this archives the whole
 * visible thread in one click. Returns the number saved.
 */
export async function captureWholeConversation(
  adapter: SiteAdapter,
  messenger: Messenger,
  platform: Platform,
  root: ParentNode = document
): Promise<number> {
  const messages = await collectAllMessages(adapter, root);
  if (messages.length === 0) {
    return 0;
  }
  // One batched round-trip; the background dedups within the batch in a single
  // pass rather than re-scanning storage per message.
  await messenger.saveMany(
    messages.map((message) => buildSaveRequest(adapter, platform, message, root))
  );
  return messages.length;
}

/**
 * Collect every message of a long conversation.
 *
 * Two things make a single DOM read incomplete: ChatGPT lazily fetches earlier
 * turns only when you scroll to the very top, and some UIs virtualize (recycle
 * off-screen nodes). So we (1) repeatedly scroll the container to the top until
 * it stops loading more, then (2) walk back down in overlapping steps,
 * accumulating messages as they appear — deduped by role+content, kept in
 * first-seen (chronological) order. Each programmatic scroll also dispatches a
 * `scroll` event so the page's own lazy-load listeners fire. Falls back to a
 * single read when there is no scroll container (short threads, jsdom/tests).
 */
export async function collectAllMessages(
  adapter: SiteAdapter,
  root: ParentNode = document,
  settleMs: number = SCROLL_SETTLE_MS
): Promise<ConversationMessage[]> {
  const ordered: ConversationMessage[] = [];
  const seen = new Set<string>();
  const absorb = (): void => {
    for (const message of adapter.extractMessages(root)) {
      const key = `${message.role}:${message.content}`;
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(message);
      }
    }
  };

  const container = findScrollContainer(adapter, root, documentOf(root));
  if (!container) {
    // Short thread fully in the DOM: return the raw snapshot so genuinely
    // repeated lines (e.g. two "ok" turns) and their order are preserved — the
    // role+content dedup below is only needed to reconcile repeated scroll reads.
    return adapter.extractMessages(root);
  }

  const scrollTo = (top: number): void => {
    container.scrollTop = top;
    container.dispatchEvent(new Event("scroll", { bubbles: true }));
  };

  const restore = container.scrollTop;

  // Phase 1: pull in earlier turns by parking at the top until neither the
  // message count nor the scroll height grows for a few consecutive tries.
  let lastCount = -1;
  let lastHeight = -1;
  let stable = 0;
  for (let guard = 0; guard < 120 && stable < 3; guard += 1) {
    scrollTo(0);
    await delay(settleMs);
    absorb();
    const count = adapter.extractMessages(root).length;
    const height = container.scrollHeight;
    stable = count === lastCount && height === lastHeight ? stable + 1 : 0;
    lastCount = count;
    lastHeight = height;
  }

  // Phase 2: descend in overlapping steps to catch any virtualized turns.
  const step = Math.max(container.clientHeight * 0.8, 200);
  let previousTop = -1;
  for (let guard = 0; guard < 600; guard += 1) {
    absorb();
    const atBottom = container.scrollTop >= container.scrollHeight - container.clientHeight - 4;
    if (atBottom || container.scrollTop === previousTop) {
      break;
    }
    previousTop = container.scrollTop;
    scrollTo(Math.min(container.scrollTop + step, container.scrollHeight));
    await delay(settleMs);
  }

  absorb();
  // A non-virtualized thread (ChatGPT/Claude keep loaded turns in the DOM) ends
  // with the entire conversation present at once. That single snapshot preserves
  // order and legitimately-repeated lines, which the cross-scroll dedup set
  // collapses — so prefer it whenever it is at least as complete as what we
  // accumulated. Truly virtualized threads keep only a window, so we fall back
  // to the accumulated list.
  const snapshot = adapter.extractMessages(root);
  container.scrollTop = restore; // leave the view where the user had it
  return snapshot.length >= ordered.length ? snapshot : ordered;
}

const SCROLL_SETTLE_MS = 400;

function findScrollContainer(
  adapter: SiteAdapter,
  root: ParentNode,
  doc: Document | null
): Element | null {
  const view = doc?.defaultView ?? null;
  const overflows = (element: Element): boolean => element.scrollHeight > element.clientHeight + 40;
  // Prefer a genuinely scrollable ancestor (overflow-y: auto/scroll); fall back
  // to the overflow heuristic when computed styles aren't available (jsdom).
  const scrollableByStyle = (element: Element): boolean => {
    if (!view) {
      return overflows(element);
    }
    const overflowY = view.getComputedStyle(element).overflowY;
    return (overflowY === "auto" || overflowY === "scroll") && overflows(element);
  };

  let element = root.querySelector?.(adapter.messageSelector)?.parentElement ?? null;
  let heuristicFallback: Element | null = null;
  while (element) {
    if (scrollableByStyle(element)) {
      return element;
    }
    if (!heuristicFallback && overflows(element)) {
      heuristicFallback = element;
    }
    element = element.parentElement;
  }

  const scrolling = doc?.scrollingElement ?? null;
  if (scrolling && overflows(scrolling)) {
    return scrolling;
  }
  return heuristicFallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a downloadable export of the whole opened thread. Uses the same
 * scroll-driven collection as "save all" so lazy-loaded and virtualized history
 * is included, not just the messages currently on screen. Returns the file
 * payload (the caller performs the download), or undefined when there is nothing
 * to export.
 */
export async function buildConversationExport(
  adapter: SiteAdapter,
  doc: Document,
  platform: Platform,
  format: ExportFormat,
  root: ParentNode = document
): Promise<ExportedConversation | undefined> {
  const messages = await collectAllMessages(adapter, root);
  if (messages.length === 0) {
    return undefined;
  }

  const title = doc.title?.trim() || `${platform}-conversation`;
  return exportConversation({ title, messages, format });
}

const PANEL_STYLE = `
  :host { all: initial; }
  :host {
    --gm-bg: #ffffff; --gm-head-bg: #ffffff; --gm-border: #d8e3ea;
    --gm-text: #162033; --gm-muted: #586574;
    --gm-surface: #effcfb; --gm-surface-hover: #dff7f5; --gm-item-bg: #f8fbfc; --gm-item-text: #253246;
    --gm-primary: #00b8a9; --gm-primary-hover: #009c91; --gm-on-primary: #ffffff;
    --gm-ok: #0f766e; --gm-warn: #b97800; --gm-danger: #ff4d49; --gm-danger-bg: #ffe8e5;
    --gm-focus: rgba(0, 184, 169, 0.24);
    --gm-shadow: 0 14px 36px rgba(22, 32, 51, 0.14);
  }
  @media (prefers-color-scheme: dark) {
    :host {
      --gm-bg: #162033; --gm-head-bg: #1d2a3e; --gm-border: #34425a;
      --gm-text: #f7f2e7; --gm-muted: #b8c0ca;
      --gm-surface: #243449; --gm-surface-hover: #2e4058; --gm-item-bg: #1d2a3e; --gm-item-text: #f2eee5;
      --gm-primary: #00d3c2; --gm-primary-hover: #00b8a9; --gm-on-primary: #162033;
      --gm-ok: #6ee7d8; --gm-warn: #fdb52a; --gm-danger: #ff8b80; --gm-danger-bg: #3f2b36;
      --gm-focus: rgba(0, 211, 194, 0.28);
      --gm-shadow: 0 8px 28px rgba(0, 0, 0, 0.42);
    }
  }
  .gm-card {
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 248px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: var(--gm-bg); color: var(--gm-text); border: 1px solid var(--gm-border);
    border-radius: 14px; box-shadow: var(--gm-shadow); overflow: hidden;
  }
  .gm-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 13px 10px; background: var(--gm-head-bg); font-size: 13px; font-weight: 700;
    border-bottom: 1px solid var(--gm-border);
  }
  .gm-brand { display: flex; align-items: center; gap: 7px; }
  .gm-logo { width: 18px; height: 18px; flex: none; border-radius: 4px; object-fit: contain; background: #fff; }
  .gm-head-actions { display: flex; align-items: center; gap: 4px; }
  .gm-iconbtn {
    all: unset; box-sizing: border-box; cursor: pointer; color: var(--gm-muted);
    width: 26px; height: 26px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center;
    line-height: 0; transition: color 0.15s ease, background 0.15s ease, transform 0.15s ease;
  }
  .gm-iconbtn:hover { background: var(--gm-surface); color: var(--gm-primary); transform: translateY(-1px); }
  .gm-iconbtn:focus-visible { outline: 2px solid var(--gm-focus); outline-offset: 1px; }
  .gm-iconbtn svg { width: 16px; height: 16px; }
  .gm-iconbtn.gm-flash-ok { color: var(--gm-ok); }
  .gm-iconbtn.gm-flash-warn { color: var(--gm-warn); }
  .gm-toggle {
    all: unset; box-sizing: border-box; cursor: pointer; color: var(--gm-muted); line-height: 0;
    width: 26px; height: 26px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center;
    transition: color 0.15s ease, background 0.15s ease, transform 0.15s ease;
  }
  .gm-toggle:hover { background: var(--gm-surface); color: var(--gm-primary); transform: translateY(-1px); }
  .gm-toggle:focus-visible { outline: 2px solid var(--gm-focus); outline-offset: 1px; }
  .gm-toggle svg { width: 16px; height: 16px; }
  .gm-body { display: flex; flex-direction: column; gap: 10px; padding: 13px 12px 14px; }
  .gm-card.gm-collapsed .gm-body { display: none; }
  .gm-btn {
    all: unset; box-sizing: border-box; cursor: pointer; text-align: center;
    min-height: 36px; padding: 9px 12px; border-radius: 9px; font-size: 13px; font-weight: 700;
    background: var(--gm-primary); color: var(--gm-on-primary);
    box-shadow: 0 10px 22px -14px rgba(0, 184, 169, 0.7);
    transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
  }
  .gm-btn:hover { background: var(--gm-primary-hover); transform: translateY(-1px); box-shadow: 0 12px 24px -14px rgba(0, 184, 169, 0.82); }
  .gm-btn:focus-visible { outline: 2px solid var(--gm-focus); outline-offset: 2px; }
  .gm-btn.gm-secondary {
    background: var(--gm-surface); color: var(--gm-text); border: 1px solid transparent; box-shadow: none;
    font-weight: 650;
  }
  .gm-btn.gm-secondary:hover { background: var(--gm-surface-hover); border-color: #b7ece7; color: #0c6f68; }
  .gm-status { min-height: 15px; font-size: 11.5px; color: var(--gm-muted); text-align: center; }
  .gm-status.gm-ok { color: var(--gm-ok); }
  .gm-status.gm-warn { color: var(--gm-warn); }
  .gm-item { background: var(--gm-item-bg); border-radius: 8px; padding: 8px 9px; display: flex; flex-direction: column; gap: 6px; }
  .gm-item-text {
    font-size: 12px; line-height: 1.4; color: var(--gm-item-text);
    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  .gm-item-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .gm-item-right { display: flex; align-items: center; gap: 6px; flex: none; }
  .gm-item-time { font-size: 10px; color: var(--gm-muted); white-space: nowrap; }
  .gm-tags { display: flex; gap: 5px; }
  .gm-tag { font-size: 10px; color: var(--gm-muted); background: var(--gm-surface); border-radius: 5px; padding: 1px 6px; }
  .gm-tag.gm-private { color: var(--gm-warn); }
  .gm-tag.gm-role-me { color: var(--gm-on-primary); background: var(--gm-primary); }
  .gm-tag.gm-role-ai { color: var(--gm-ok); }
  .gm-item.gm-answer { border-left: 2px solid var(--gm-primary); }
  .gm-del { all: unset; cursor: pointer; color: var(--gm-muted); font-size: 12px; padding: 2px 7px; border-radius: 5px; }
  .gm-del:hover { background: var(--gm-danger-bg); color: var(--gm-danger); }
  .gm-empty { font-size: 12px; color: var(--gm-muted); text-align: center; padding: 8px 0; }
  .gm-divider { height: 1px; background: var(--gm-border); margin: 1px 0 0; }
  .gm-row { display: grid; grid-template-columns: 1fr auto; gap: 7px; align-items: center; }
  .gm-select {
    all: unset; box-sizing: border-box; cursor: pointer; min-width: 0; height: 34px;
    background: var(--gm-surface); color: var(--gm-text); font-size: 12px; padding: 0 28px 0 10px;
    border: 1px solid transparent; border-radius: 9px;
    background-image:
      linear-gradient(45deg, transparent 50%, var(--gm-muted) 50%),
      linear-gradient(135deg, var(--gm-muted) 50%, transparent 50%);
    background-position: calc(100% - 15px) 14px, calc(100% - 10px) 14px;
    background-size: 5px 5px, 5px 5px;
    background-repeat: no-repeat;
  }
  .gm-select:hover { background-color: var(--gm-surface-hover); border-color: #b7ece7; }
  .gm-select:focus-visible { outline: 2px solid var(--gm-focus); outline-offset: 1px; }
  .gm-select option {
    color: #162033;
    background: #ffffff;
  }
  .gm-mini {
    all: unset; box-sizing: border-box; cursor: pointer; height: 34px; min-width: 48px;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--gm-primary); color: var(--gm-on-primary);
    font-size: 12px; font-weight: 700; padding: 0 13px; border-radius: 9px;
    box-shadow: 0 8px 18px -12px rgba(0, 184, 169, 0.78);
    transition: background 0.15s ease, transform 0.15s ease;
  }
  .gm-mini:hover { background: var(--gm-primary-hover); transform: translateY(-1px); }
  .gm-mini:focus-visible { outline: 2px solid var(--gm-focus); outline-offset: 1px; }
  .gm-check {
    display: flex; align-items: center; gap: 8px; font-size: 11.5px;
    color: var(--gm-muted); cursor: pointer; user-select: none;
  }
  .gm-check input {
    appearance: none; box-sizing: border-box; cursor: pointer; margin: 0;
    width: 13px; height: 13px; border: 1.5px solid #8fa2b1; border-radius: 3px;
    background: #fff; display: grid; place-content: center;
  }
  .gm-check input::before {
    content: ""; width: 7px; height: 7px; transform: scale(0); transition: transform 0.12s ease;
    clip-path: polygon(14% 44%, 0 60%, 38% 100%, 100% 18%, 84% 4%, 36% 70%);
    background: var(--gm-on-primary);
  }
  .gm-check input:checked { border-color: var(--gm-primary); background: var(--gm-primary); }
  .gm-check input:checked::before { transform: scale(1); }
  .gm-check input:focus-visible { outline: 2px solid var(--gm-focus); outline-offset: 2px; }
  .gm-drawer {
    position: fixed; top: 0; right: 0; bottom: 0; width: 360px; max-width: 92vw; z-index: 2147483647;
    background: var(--gm-bg); color: var(--gm-text); border-left: 1px solid var(--gm-border);
    box-shadow: var(--gm-shadow); transform: translateX(100%); transition: transform 0.22s ease;
    display: flex; flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  .gm-drawer.gm-open { transform: none; }
  .gm-drawer-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; background: var(--gm-head-bg); font-size: 14px; font-weight: 600;
  }
  .gm-drawer-close {
    all: unset; cursor: pointer; color: var(--gm-muted); font-size: 16px;
    padding: 2px 8px; border-radius: 6px;
  }
  .gm-drawer-close:hover { background: var(--gm-surface); color: var(--gm-text); }
  .gm-drawer-back {
    all: unset; cursor: pointer; color: var(--gm-muted); font-size: 16px;
    padding: 2px 8px; border-radius: 6px; flex: none;
  }
  .gm-drawer-back:hover { background: var(--gm-surface); color: var(--gm-text); }
  .gm-drawer-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gm-conv {
    display: flex; align-items: center; gap: 8px; padding: 10px 11px;
    border: 1px solid var(--gm-border); border-radius: 10px; cursor: pointer;
  }
  .gm-conv:hover { background: var(--gm-head-bg); }
  .gm-conv-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .gm-conv-title-row { display: flex; align-items: baseline; gap: 8px; }
  .gm-conv-title { flex: 1; font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gm-conv-time { flex: none; font-size: 10.5px; color: var(--gm-muted); }
  .gm-conv-preview {
    font-size: 11.5px; color: var(--gm-muted); overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .gm-conv-side { display: flex; align-items: center; gap: 4px; flex: none; }
  .gm-conv-count { font-size: 11px; color: var(--gm-muted); }
  .gm-conv-chevron { color: var(--gm-muted); font-size: 13px; }
  .gm-detail-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 2px; }
  .gm-detail-link { font-size: 11px; color: var(--gm-primary); text-decoration: none; }
  .gm-detail-link:hover { text-decoration: underline; }
  .gm-detail-del {
    all: unset; cursor: pointer; font-size: 11px; color: var(--gm-muted);
    padding: 1px 6px; border-radius: 5px;
  }
  .gm-detail-del:hover { background: var(--gm-danger-bg); color: var(--gm-danger); }
  .gm-search { margin: 12px 16px 0; }
  .gm-search input {
    all: unset; box-sizing: border-box; width: 100%; background: var(--gm-surface);
    color: var(--gm-text); font-size: 13px; padding: 9px 11px; border-radius: 8px;
  }
  .gm-groups { flex: 1; overflow-y: auto; padding: 12px 16px 20px; display: flex; flex-direction: column; gap: 8px; }
`;

const LOGO_DATA_URL =
  "data:image/png;base64,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";
const LOGO_SVG = `<img class="gm-logo" src="${LOGO_DATA_URL}" alt="" aria-hidden="true">`;

const SAVE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14v10H9l-4 4V5Z"/><path d="M9 9h6"/><path d="M9 12h4"/><path d="m14.8 15.2 1.4 1.4 3-3"/></svg>`;
const INJECT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5.5" cy="7" r="2"/><circle cx="5.5" cy="17" r="2"/><path d="M7.5 7h4.5c2.2 0 4 1.8 4 4v1"/><path d="M7.5 17h4.5c2.2 0 4-1.8 4-4v-1"/><path d="M13 12h6"/><path d="m16 9 3 3-3 3"/></svg>`;
const COLLAPSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>`;
const EXPAND_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg>`;

const PANEL_HTML = `
  <div class="gm-card" data-gotomemory-card>
    <div class="gm-head">
      <span class="gm-brand">${LOGO_SVG} gotomemory</span>
      <div class="gm-head-actions">
        <button class="gm-iconbtn" data-gotomemory-quick="save-all" title="保存整段对话" aria-label="保存整段对话">${SAVE_ICON}</button>
        <button class="gm-iconbtn" data-gotomemory-quick="inject" title="注入相关记忆" aria-label="注入相关记忆">${INJECT_ICON}</button>
        <button class="gm-toggle" data-gotomemory-toggle title="折叠" aria-label="折叠">${COLLAPSE_ICON}</button>
      </div>
    </div>
    <div class="gm-body">
      <button class="gm-btn" data-gotomemory-action="save-all">保存整段对话</button>
      <button class="gm-btn gm-secondary" data-gotomemory-action="inject">注入相关记忆</button>
      <button class="gm-btn gm-secondary" data-gotomemory-action="list">查看记忆</button>
      <div class="gm-divider"></div>
      <div class="gm-row">
        <select class="gm-select" data-gotomemory-format>
          <option value="markdown">Markdown</option>
          <option value="txt">纯文本 TXT</option>
          <option value="obsidian">Obsidian</option>
          <option value="pdf">PDF</option>
          <option value="html">HTML</option>
          <option value="json">JSON</option>
          <option value="docx">Word DOCX</option>
        </select>
        <button class="gm-mini" data-gotomemory-action="export">导出</button>
      </div>
      <label class="gm-check">
        <input type="checkbox" data-gotomemory-auto> 自动捕获（发送即保存）
      </label>
      <div class="gm-status" data-gotomemory-status></div>
    </div>
  </div>
  <aside class="gm-drawer" data-gotomemory-drawer>
    <div class="gm-drawer-head">
      <button class="gm-drawer-back" data-gotomemory-back title="返回" hidden>←</button>
      <span class="gm-drawer-title" data-gotomemory-drawer-title>记忆库</span>
      <button class="gm-drawer-close" data-gotomemory-drawer-close title="关闭">✕</button>
    </div>
    <div class="gm-search" data-gotomemory-search-wrap>
      <input type="text" placeholder="搜索会话…" data-gotomemory-search>
    </div>
    <div class="gm-groups" data-gotomemory-groups></div>
  </aside>
`;

/** Build the floating, Shadow-DOM-isolated control panel for a content script. */
function buildPanel(
  doc: Document,
  adapter: SiteAdapter,
  messenger: Messenger,
  platform: Platform,
  root: ParentNode
): HTMLElement {
  const host = doc.createElement("div");
  host.setAttribute("data-gotomemory-panel", "true");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>${PANEL_STYLE}</style>${PANEL_HTML}`;

  const card = shadow.querySelector("[data-gotomemory-card]");
  const status = shadow.querySelector<HTMLElement>("[data-gotomemory-status]");
  const toggle = shadow.querySelector<HTMLElement>("[data-gotomemory-toggle]");
  const drawer = shadow.querySelector<HTMLElement>("[data-gotomemory-drawer]");
  const groups = shadow.querySelector<HTMLElement>("[data-gotomemory-groups]");
  const search = shadow.querySelector<HTMLInputElement>("[data-gotomemory-search]");
  const searchWrap = shadow.querySelector<HTMLElement>("[data-gotomemory-search-wrap]");
  const drawerTitle = shadow.querySelector<HTMLElement>("[data-gotomemory-drawer-title]");
  const backButton = shadow.querySelector<HTMLElement>("[data-gotomemory-back]");

  // Two-level memory library: level 1 lists conversations (title + last line),
  // level 2 (detailKey set) shows one conversation's full record.
  let detailKey: string | null = null;
  const renderDrawer = (): void => {
    if (groups) {
      void renderMemoryLibrary(groups, doc, messenger, {
        detailKey,
        query: search?.value ?? "",
        searchWrap,
        drawerTitle,
        backButton,
        openDetail: (key) => {
          detailKey = key;
          renderDrawer();
        },
        openList: () => {
          detailKey = null;
          renderDrawer();
        },
        refresh: renderDrawer
      });
    }
  };

  // Save and inject are wired to both the body buttons and the header quick
  // icons, so they work whether the panel is expanded or collapsed. The icon
  // flashes green/amber for feedback (the status line is hidden when collapsed).
  const bindAction = (action: string, handler: () => void): void => {
    shadow
      .querySelectorAll(`[data-gotomemory-action="${action}"], [data-gotomemory-quick="${action}"]`)
      .forEach((element) => element.addEventListener("click", handler));
  };

  bindAction("save-all", () => {
    void (async () => {
      setStatus(status, "处理中…", "");
      let ok = false;
      try {
        const count = await captureWholeConversation(adapter, messenger, platform, root);
        ok = count > 0;
        setStatus(
          status,
          ok ? `✓ 已保存整段对话 ${count} 条` : "未找到可保存的消息",
          ok ? "ok" : "warn"
        );
      } catch {
        setStatus(status, "出错了，请重试", "warn");
      }
      flashIcon(shadow.querySelector('[data-gotomemory-quick="save-all"]'), ok);
    })();
  });

  bindAction("inject", () => {
    void (async () => {
      setStatus(status, "处理中…", "");
      let ok = false;
      try {
        ok = await injectRelevantMemories(adapter, messenger, platform, root);
        setStatus(status, ok ? "✓ 已注入相关记忆" : "暂无相关记忆可注入", ok ? "ok" : "warn");
      } catch {
        setStatus(status, "出错了，请重试", "warn");
      }
      flashIcon(shadow.querySelector('[data-gotomemory-quick="inject"]'), ok);
    })();
  });

  shadow.querySelector('[data-gotomemory-action="export"]')?.addEventListener("click", () => {
    void (async () => {
      const format = (shadow.querySelector<HTMLSelectElement>("[data-gotomemory-format]")?.value ??
        "markdown") as ExportFormat;
      setStatus(status, "处理中…", "");
      try {
        const exported = await buildConversationExport(adapter, doc, platform, format, root);
        if (!exported) {
          setStatus(status, "当前没有可导出的对话", "warn");
          return;
        }
        triggerDownload(doc, exported);
        setStatus(status, `✓ 已导出 ${exported.filename}`, "ok");
      } catch {
        setStatus(status, "导出失败，请重试", "warn");
      }
    })();
  });

  wireAutoCapture(shadow, adapter, messenger, platform, root, doc, status);

  shadow.querySelector('[data-gotomemory-action="list"]')?.addEventListener("click", () => {
    detailKey = null;
    drawer?.classList.add("gm-open");
    renderDrawer();
  });

  shadow.querySelector("[data-gotomemory-drawer-close]")?.addEventListener("click", () => {
    drawer?.classList.remove("gm-open");
  });

  backButton?.addEventListener("click", () => {
    detailKey = null;
    renderDrawer();
  });

  // Debounce so a full re-query + re-render doesn't run on every keystroke.
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  search?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderDrawer(), SEARCH_DEBOUNCE_MS);
  });

  toggle?.addEventListener("click", () => {
    const collapsed = card?.classList.toggle("gm-collapsed") ?? false;
    toggle.innerHTML = collapsed ? EXPAND_ICON : COLLAPSE_ICON;
    toggle.title = collapsed ? "展开" : "折叠";
    toggle.setAttribute("aria-label", collapsed ? "展开" : "折叠");
  });

  return host;
}

/** Trigger a browser download for an exported conversation payload. */
function triggerDownload(doc: Document, exported: ExportedConversation): void {
  const part: BlobPart =
    typeof exported.content === "string" ? exported.content : new Uint8Array(exported.content);
  const blob = new Blob([part], { type: exported.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = exported.filename;
  doc.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Assistant answers stream in token-by-token, so a mutation fires many times
// before the message is complete. Debounce captures until the DOM settles, so a
// streamed answer is saved once (in its final form) rather than as fragments.
const AUTO_CAPTURE_DEBOUNCE_MS = 800;

// Wait for typing to pause before re-querying/re-rendering the memory library.
const SEARCH_DEBOUNCE_MS = 200;

/**
 * Auto-capture: while the checkbox is on, watch the conversation and save new
 * messages — both your questions and the assistant's answers — as they settle.
 * Messages already present when toggled on are seeded as "seen", and a
 * role+content key avoids saving the same line twice.
 */
function wireAutoCapture(
  shadow: ShadowRoot,
  adapter: SiteAdapter,
  messenger: Messenger,
  platform: Platform,
  root: ParentNode,
  doc: Document,
  status: HTMLElement | null
): void {
  const checkbox = shadow.querySelector<HTMLInputElement>("[data-gotomemory-auto]");
  if (!checkbox) {
    return;
  }

  const seen = new Set<string>();
  let observer: MutationObserver | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      for (const message of adapter.extractMessages(root)) {
        seen.add(seenKey(message));
      }
      const target = root instanceof Element ? root : (doc.body ?? doc.documentElement);
      if (target && typeof MutationObserver !== "undefined") {
        observer = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            void captureNewMessages(adapter, messenger, platform, root, seen, status);
          }, AUTO_CAPTURE_DEBOUNCE_MS);
        });
        observer.observe(target, { childList: true, subtree: true });
      }
      setStatus(status, "已开启自动捕获", "ok");
    } else {
      observer?.disconnect();
      observer = null;
      clearTimeout(timer);
      setStatus(status, "已关闭自动捕获", "");
    }
  });
}

function seenKey(message: ConversationMessage): string {
  // Normalize whitespace so a post-stream re-render (markdown reflow, trailing
  // spaces) of the same answer doesn't read as a new message and get re-saved.
  return `${message.role}:${message.content.replace(/\s+/g, " ").trim()}`;
}

/** Save any messages (either role) not yet seen. Exported for direct testing. */
export async function captureNewMessages(
  adapter: SiteAdapter,
  messenger: Messenger,
  platform: Platform,
  root: ParentNode,
  seen: Set<string>,
  status: HTMLElement | null = null
): Promise<number> {
  let saved = 0;
  for (const message of adapter.extractMessages(root)) {
    const key = seenKey(message);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    try {
      await messenger.save(buildSaveRequest(adapter, platform, message, root));
      saved += 1;
      setStatus(status, "✓ 自动保存了一条", "ok");
    } catch {
      setStatus(status, "自动保存失败", "warn");
    }
  }
  return saved;
}

interface ConversationGroup {
  key: string;
  title: string | null;
  url: string | null;
  source: Memory["source"];
  items: Memory[];
}

const LOOSE_GROUP = "__loose__";

// The memory library lists everything saved, so it must not inherit the
// relevance search's small default window.
const DRAWER_LIMIT = 10000;

/** Group memories by their conversation, preserving the order they arrive in. */
function groupByConversation(memories: Memory[]): ConversationGroup[] {
  const groups = new Map<string, ConversationGroup>();
  for (const memory of memories) {
    // Memories without a conversation each stand alone, so "delete group" on one
    // unclassified memory never wipes out every other unclassified memory.
    const key = memory.conversation_id ?? `${LOOSE_GROUP}:${memory.id}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        title: memory.conversation_title ?? null,
        url: memory.source_url ?? null,
        source: memory.source,
        items: []
      };
      groups.set(key, group);
    }
    group.items.push(memory);
  }
  return [...groups.values()];
}

interface LibraryViewOptions {
  detailKey: string | null;
  query: string;
  searchWrap: HTMLElement | null;
  drawerTitle: HTMLElement | null;
  backButton: HTMLElement | null;
  openDetail: (key: string) => void;
  openList: () => void;
  refresh: () => void;
}

/**
 * Render the two-level memory library: a conversation list (title + last line)
 * at the top level, and one conversation's full record when a detailKey is set.
 */
async function renderMemoryLibrary(
  container: HTMLElement,
  doc: Document,
  messenger: Messenger,
  options: LibraryViewOptions
): Promise<void> {
  const inDetail = options.detailKey !== null;
  // Search filters the conversation list only; inside a conversation we show
  // every message regardless of the search box.
  if (options.searchWrap) {
    options.searchWrap.hidden = inDetail;
  }
  if (options.backButton) {
    options.backButton.hidden = !inDetail;
  }

  try {
    const query = inDetail ? "" : options.query.trim();
    const memories = await messenger.search({ q: query || undefined, limit: DRAWER_LIMIT });
    const conversations = groupByConversation(memories);

    if (inDetail) {
      const group = conversations.find((item) => item.key === options.detailKey);
      if (!group) {
        options.openList();
        return;
      }
      if (options.drawerTitle) {
        options.drawerTitle.textContent = groupLabel(group);
      }
      renderConversationDetail(container, doc, group, messenger, options.refresh);
      return;
    }

    if (options.drawerTitle) {
      options.drawerTitle.textContent = "记忆库";
    }
    container.replaceChildren();
    if (conversations.length === 0) {
      const empty = doc.createElement("div");
      empty.className = "gm-empty";
      empty.textContent = query ? "没有匹配的会话" : "还没有保存的记忆";
      container.append(empty);
      return;
    }
    for (const group of conversations) {
      container.append(conversationRow(doc, group, messenger, options.openDetail, options.refresh));
    }
  } catch {
    const error = doc.createElement("div");
    error.className = "gm-empty";
    error.textContent = "读取失败，请重试";
    container.replaceChildren(error);
  }
}

/** Level 1 row: conversation title, a preview of the last message, and count. */
function conversationRow(
  doc: Document,
  group: ConversationGroup,
  messenger: Messenger,
  openDetail: (key: string) => void,
  refresh: () => void
): HTMLElement {
  const row = doc.createElement("div");
  row.className = "gm-conv";
  row.setAttribute("data-gotomemory-conversation", group.key);
  row.addEventListener("click", () => openDetail(group.key));

  const main = doc.createElement("div");
  main.className = "gm-conv-main";

  const titleRow = doc.createElement("div");
  titleRow.className = "gm-conv-title-row";
  const title = doc.createElement("span");
  title.className = "gm-conv-title";
  title.textContent = groupLabel(group);
  const time = doc.createElement("span");
  time.className = "gm-conv-time";
  time.textContent = conversationTime(group);
  time.setAttribute("data-gotomemory-time", "");
  titleRow.append(title, time);

  const last = group.items[group.items.length - 1];
  const preview = doc.createElement("div");
  preview.className = "gm-conv-preview";
  const speaker = last?.role === "assistant" ? "AI：" : last?.role === "user" ? "我：" : "";
  preview.textContent = last ? `${speaker}${last.content}` : "";

  main.append(titleRow, preview);

  const side = doc.createElement("div");
  side.className = "gm-conv-side";
  const count = doc.createElement("span");
  count.className = "gm-conv-count";
  count.textContent = `${group.items.length} 条`;

  const remove = doc.createElement("button");
  remove.type = "button";
  remove.className = "gm-detail-del";
  remove.title = "删除整组";
  remove.textContent = "🗑";
  remove.addEventListener("click", (event) => {
    event.stopPropagation();
    void (async () => {
      for (const item of group.items) {
        await messenger.remove(item.id);
      }
      refresh();
    })();
  });

  const chevron = doc.createElement("span");
  chevron.className = "gm-conv-chevron";
  chevron.textContent = "›";

  side.append(count, remove, chevron);
  row.append(main, side);
  return row;
}

/** Level 2: one conversation's full record. */
function renderConversationDetail(
  container: HTMLElement,
  doc: Document,
  group: ConversationGroup,
  messenger: Messenger,
  refresh: () => void
): void {
  container.replaceChildren();

  const meta = doc.createElement("div");
  meta.className = "gm-detail-meta";

  const count = doc.createElement("span");
  count.className = "gm-conv-count";
  count.textContent = `${group.items.length} 条`;
  meta.append(count);

  if (group.url) {
    const link = doc.createElement("a");
    link.className = "gm-detail-link";
    link.textContent = "打开原对话";
    link.href = group.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    meta.append(link);
  }

  const removeAll = doc.createElement("button");
  removeAll.type = "button";
  removeAll.className = "gm-detail-del";
  removeAll.textContent = "删除整组";
  removeAll.addEventListener("click", () => {
    void (async () => {
      for (const item of group.items) {
        await messenger.remove(item.id);
      }
      refresh();
    })();
  });
  meta.append(removeAll);

  container.append(meta);
  for (const memory of group.items) {
    container.append(memoryItem(doc, memory, messenger, refresh));
  }
}

function groupLabel(group: ConversationGroup): string {
  if (group.title) {
    return group.title;
  }
  if (group.key === LOOSE_GROUP || group.key.startsWith(`${LOOSE_GROUP}:`)) {
    return "未归类记忆";
  }
  return `会话 ${group.key.slice(0, 8)}`;
}

function memoryItem(
  doc: Document,
  memory: Memory,
  messenger: Messenger,
  refresh: () => void
): HTMLElement {
  const row = doc.createElement("div");
  row.className = memory.role === "assistant" ? "gm-item gm-answer" : "gm-item";

  const text = doc.createElement("div");
  text.className = "gm-item-text";
  text.textContent = memory.content;
  text.title = memory.content;

  const foot = doc.createElement("div");
  foot.className = "gm-item-foot";

  const tags = doc.createElement("div");
  tags.className = "gm-tags";
  if (memory.role === "user" || memory.role === "assistant") {
    const role = doc.createElement("span");
    role.className = memory.role === "assistant" ? "gm-tag gm-role-ai" : "gm-tag gm-role-me";
    role.textContent = memory.role === "assistant" ? "AI" : "我";
    tags.append(role);
  }
  const source = doc.createElement("span");
  source.className = "gm-tag";
  source.textContent = memory.source;
  tags.append(source);
  if (memory.is_private) {
    const priv = doc.createElement("span");
    priv.className = "gm-tag gm-private";
    priv.textContent = "私密";
    tags.append(priv);
  }

  const right = doc.createElement("div");
  right.className = "gm-item-right";
  const time = doc.createElement("span");
  time.className = "gm-item-time";
  time.textContent = formatTimestamp(memory.created_at);
  time.setAttribute("data-gotomemory-time", "");

  const del = doc.createElement("button");
  del.type = "button";
  del.className = "gm-del";
  del.title = "删除";
  del.textContent = "✕";
  del.setAttribute("data-gotomemory-delete", memory.id);
  del.addEventListener("click", () => {
    void (async () => {
      await messenger.remove(memory.id);
      refresh();
    })();
  });

  right.append(time, del);
  foot.append(tags, right);
  row.append(text, foot);
  return row;
}

/** Friendly local time: today shows the clock, this year shows month/day, older shows the year. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const now = new Date();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${hh}:${mm}`;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${monthDay} ${hh}:${mm}`;
  }
  return `${date.getFullYear()}年${monthDay}`;
}

/** The most recent activity time of a conversation (its latest saved message). */
function conversationTime(group: ConversationGroup): string {
  const latest = group.items.reduce((newest, item) =>
    item.created_at > newest.created_at ? item : newest
  );
  return formatTimestamp(latest.created_at);
}

/** Briefly tint a header quick-icon green (ok) or amber (warn) for feedback. */
function flashIcon(icon: Element | null, ok: boolean): void {
  if (!icon) {
    return;
  }
  const cls = ok ? "gm-flash-ok" : "gm-flash-warn";
  icon.classList.add(cls);
  setTimeout(() => icon.classList.remove(cls), 1200);
}

function setStatus(status: HTMLElement | null, text: string, kind: "" | "ok" | "warn"): void {
  if (!status) {
    return;
  }
  status.textContent = text;
  status.className = kind ? `gm-status gm-${kind}` : "gm-status";
}

declare const chrome:
  | {
      runtime?: {
        getURL?: (path: string) => string;
        sendMessage?: (message: ExtensionMessage) => Promise<ExtensionMessageResponse>;
      };
    }
  | undefined;

function createChromeMessenger(): Messenger {
  return createRuntimeMessenger(async (message) => {
    const send = chrome?.runtime?.sendMessage;
    if (!send) {
      return { ok: false, error: "chrome.runtime.sendMessage unavailable" };
    }
    return send(message);
  });
}

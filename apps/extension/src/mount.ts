import type {
  ConversationMessage,
  Memory,
  Platform,
  SaveMemoryRequest
} from "@gotomemory/contracts";
import {
  formatAuthorizedMemoryPrompt,
  pickUnappliedTemplates,
  suggestMemorableLines,
  type MetricEvent
} from "@gotomemory/core";
import {
  createTranslator,
  detectBrowserLocale,
  resolveLocale,
  type Locale,
  type LocalePreference,
  type MessageKey,
  type Translator
} from "@gotomemory/i18n";
import {
  exportConversation,
  toPrintableHtml,
  type ExportedConversation,
  type ExportFormat
} from "@gotomemory/export";
import {
  adapters,
  applySelectorOverrides,
  findComposer,
  type SiteAdapter
} from "@gotomemory/site-adapters";

import { DRAWER_LIMIT, renderMemoryLibrary } from "./library.js";
import {
  applyPanelText,
  COLLAPSE_ICON,
  EXPAND_ICON,
  PANEL_HTML,
  PANEL_STYLE
} from "./panel-view.js";
import {
  createRuntimeMessenger,
  type ExtensionMessage,
  type ExtensionMessageResponse,
  type ExtensionSettings
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

  // Overlay any verified remote selector overrides before the first extraction
  // (monorepo spec §7). Fire-and-forget: built-in selectors work meanwhile.
  void applyRemoteSelectorOverrides(messenger);

  host.append(buildPanel(doc, adapter, messenger, platform, root));
  return true;
}

async function applyRemoteSelectorOverrides(messenger: Messenger): Promise<void> {
  try {
    const overrides = await messenger.getSelectorOverrides();
    if (overrides) {
      applySelectorOverrides(adapters, overrides);
    }
  } catch {
    // fail open to the built-in selectors
  }
}

/** Best-effort metric ping (spec §12.4); the counted action must never fail on it. */
async function recordMetricSafe(messenger: Messenger, event: MetricEvent): Promise<void> {
  try {
    await messenger.recordMetric(event);
  } catch {
    // metrics are optional by design
  }
}

async function updateSettingsSafe(
  messenger: Messenger,
  patch: Partial<ExtensionSettings>
): Promise<void> {
  try {
    await messenger.updateSettings(patch);
  } catch {
    // settings persistence is best-effort in degraded contexts
  }
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

  // Hold on to the panel we mounted so the common case (it is still attached)
  // is an `isConnected` read rather than a document-wide querySelector. The
  // panel is appended last to <body>, so the attribute lookup in
  // mountContentScript has to walk the entire conversation DOM before it
  // matches — and this observer fires continuously while an answer streams in.
  let panel: Element | null = doc.querySelector("[data-gotomemory-panel]");
  const tryMount = (): void => {
    if (panel?.isConnected) {
      return;
    }
    mountContentScript(platform, options);
    panel = doc.querySelector("[data-gotomemory-panel]");
  };

  tryMount();

  const target = doc.body ?? doc.documentElement;
  if (!target || typeof MutationObserver === "undefined") {
    return () => {};
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    // Streaming answers fire mutations continuously; a microtask-coalesced
    // remount check still ran once per animation-frame-ish burst. Only a route
    // change can drop the panel, so a lazy re-check is enough.
    if (timer !== undefined) {
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      tryMount();
    }, REMOUNT_CHECK_MS);
  });
  observer.observe(target, { childList: true, subtree: true });
  return () => {
    clearTimeout(timer);
    observer.disconnect();
  };
}

/** How long to let DOM churn settle before re-checking that the panel survived. */
const REMOUNT_CHECK_MS = 500;

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
export interface InjectResult {
  /** How many memories were actually inserted (0 when none matched or insertion failed). */
  count: number;
  /** The exact inserted block, kept so trust-mode undo can remove it verbatim. */
  text: string | null;
  /**
   * Private memories that matched the topic but were deliberately NOT inserted.
   * Spec §6.1/§9: private memories only ever enter a conversation after an
   * explicit per-use confirmation, in every mode including trust mode.
   */
  pending: Memory[];
}

/** Insert an explicit set of memories (the private-confirmation path). */
export function insertMemories(
  adapter: SiteAdapter,
  memories: Memory[],
  root: ParentNode = document,
  locale: Locale = detectBrowserLocale()
): InjectResult {
  if (memories.length === 0) {
    return { count: 0, text: null, pending: [] };
  }
  // The framing lands in the user's own composer, so it follows the UI language.
  const text = formatAuthorizedMemoryPrompt(memories, locale);
  return adapter.insertIntoPrompt(text, root)
    ? { count: memories.length, text, pending: [] }
    : { count: 0, text: null, pending: [] };
}

export async function injectRelevantMemories(
  adapter: SiteAdapter,
  messenger: Messenger,
  platform: Platform,
  root: ParentNode = document,
  locale: Locale = detectBrowserLocale()
): Promise<InjectResult> {
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
    return { count: 0, text: null, pending: context.needs_confirm };
  }

  return {
    ...insertMemories(adapter, context.ready, root, locale),
    pending: context.needs_confirm
  };
}

function readComposerText(adapter: SiteAdapter, root: ParentNode): string {
  // Same priority-resolution as insertion, so we read the composer we would
  // write to — not a stray editable that happens to come first in DOM order.
  const element = findComposer(adapter.inputSelector, root);
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
  settleMs: number = SCROLL_SETTLE_MS,
  budgetMs: number = COLLECT_BUDGET_MS
): Promise<ConversationMessage[]> {
  // Hard wall-clock budget. The per-phase guards alone allowed 120 + 600
  // iterations of `settleMs`, i.e. ~5 minutes of hijacked scrolling on a page
  // that keeps growing (infinite feeds, a never-settling height). Whatever has
  // been collected by the deadline is what gets saved/exported.
  const deadline = Date.now() + budgetMs;
  const outOfTime = (): boolean => Date.now() >= deadline;
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
  for (let guard = 0; guard < 120 && stable < 3 && !outOfTime(); guard += 1) {
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
    if (atBottom || container.scrollTop === previousTop || outOfTime()) {
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

/** Wall-clock ceiling for a whole-history collection pass. */
const COLLECT_BUDGET_MS = 45_000;

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
  root: ParentNode = document,
  prefetched?: ConversationMessage[]
): Promise<ExportedConversation | undefined> {
  const messages = prefetched ?? (await collectAllMessages(adapter, root));
  if (messages.length === 0) {
    return undefined;
  }

  const title = doc.title?.trim() || `${platform}-conversation`;
  return exportConversation({ title, messages, format });
}

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

  // Language: the browser's, until a stored preference says otherwise. Settings
  // load asynchronously, so the panel opens in the detected language and
  // re-labels itself in place if the user has picked a different one.
  let locale: Locale = detectBrowserLocale(doc.defaultView?.navigator);
  let t: Translator = createTranslator(locale);
  let collapsed = false;
  applyPanelText(shadow, t);

  const card = shadow.querySelector("[data-gotomemory-card]");
  const status = shadow.querySelector<HTMLElement>("[data-gotomemory-status]");
  const toggle = shadow.querySelector<HTMLElement>("[data-gotomemory-toggle]");
  const drawer = shadow.querySelector<HTMLElement>("[data-gotomemory-drawer]");
  const groups = shadow.querySelector<HTMLElement>("[data-gotomemory-groups]");
  const search = shadow.querySelector<HTMLInputElement>("[data-gotomemory-search]");
  const searchWrap = shadow.querySelector<HTMLElement>("[data-gotomemory-search-wrap]");
  const drawerTitle = shadow.querySelector<HTMLElement>("[data-gotomemory-drawer-title]");
  const backButton = shadow.querySelector<HTMLElement>("[data-gotomemory-back]");

  // The collapse control's label depends on state, not just language, so it is
  // re-derived after both a toggle and a language switch.
  const applyCollapsedLabel = (): void => {
    if (!toggle) {
      return;
    }
    const label = t(collapsed ? "panel.action.expand" : "panel.action.collapse");
    toggle.innerHTML = collapsed ? EXPAND_ICON : COLLAPSE_ICON;
    toggle.title = label;
    toggle.setAttribute("aria-label", label);
  };

  // Two-level memory library: level 1 lists conversations (title + last line),
  // level 2 (detailKey set) shows one conversation's full record.
  let detailKey: string | null = null;
  const renderDrawer = (): void => {
    if (groups) {
      void renderMemoryLibrary(groups, doc, messenger, {
        detailKey,
        query: search?.value ?? "",
        locale,
        t,
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

  const undoButton = shadow.querySelector<HTMLElement>("[data-gotomemory-undo]");
  const suggestBox = shadow.querySelector<HTMLElement>("[data-gotomemory-suggest]");
  const suggestText = shadow.querySelector<HTMLElement>("[data-gotomemory-suggest-text]");
  const suggestSave = shadow.querySelector<HTMLElement>("[data-gotomemory-suggest-save]");
  const settingsSection = shadow.querySelector<HTMLElement>("[data-gotomemory-settings]");
  const settingsToggle = shadow.querySelector<HTMLElement>("[data-gotomemory-settings-toggle]");
  const trustCheckbox = shadow.querySelector<HTMLInputElement>("[data-gotomemory-trust]");
  const metricsCheckbox = shadow.querySelector<HTMLInputElement>("[data-gotomemory-metrics]");
  const metricsReadout = shadow.querySelector<HTMLElement>("[data-gotomemory-metrics-readout]");
  const confirmBox = shadow.querySelector<HTMLElement>("[data-gotomemory-confirm]");
  const confirmText = shadow.querySelector<HTMLElement>("[data-gotomemory-confirm-text]");
  const localeSelect = shadow.querySelector<HTMLSelectElement>("[data-gotomemory-locale]");

  let lastInjectedText: string | null = null;
  let onboardingPending = false;
  let pendingSuggestions: SaveMemoryRequest[] = [];
  let pendingPrivate: Memory[] = [];

  // Runs the border-beam animation while an async action is in flight; stops it
  // the moment the action resolves (spec: user-requested progress affordance).
  const setBusy = (on: boolean): void => {
    card?.classList.toggle("gm-busy", on);
  };

  // The undo link and the post-export suggestion are one-shot prompts tied to
  // the *last* action. Clear both before every new action so stale prompts from
  // an earlier click never linger (and so the two are mutually exclusive).
  const resetTransients = (): void => {
    lastInjectedText = null;
    pendingSuggestions = [];
    pendingPrivate = [];
    if (undoButton) {
      undoButton.hidden = true;
    }
    if (suggestBox) {
      suggestBox.hidden = true;
    }
    if (confirmBox) {
      confirmBox.hidden = true;
    }
  };

  /**
   * Private memories never ride along with an inject — in trust mode either.
   * They are offered here as an explicit, per-use confirmation (spec §6.1/§9).
   */
  const offerPrivate = (memories: Memory[]): void => {
    if (memories.length === 0 || !confirmBox || !confirmText) {
      return;
    }
    pendingPrivate = memories;
    confirmText.textContent = t("panel.confirm.text", { count: memories.length });
    confirmBox.hidden = false;
  };

  const showInjected = (result: InjectResult): void => {
    resetTransients();
    lastInjectedText = result.text;
    if (undoButton) {
      undoButton.hidden = result.text === null;
    }
    offerPrivate(result.pending);
  };

  // First-run guidance points at export — the install-moment value (spec §5.0);
  // the first successful export dismisses it for good.
  const completeOnboarding = (): void => {
    if (!onboardingPending) {
      return;
    }
    onboardingPending = false;
    void updateSettingsSafe(messenger, { onboarded: true });
  };

  // Post-export hand-off (spec §2.1): export brought the user here; a saved
  // preference is what keeps them. Shown only in the moment after an export.
  const offerSuggestions = (messages: ConversationMessage[]): void => {
    const suggestions = suggestMemorableLines(messages);
    if (suggestions.length === 0 || !suggestBox || !suggestText) {
      return;
    }
    pendingSuggestions = suggestions;
    suggestText.textContent = t("panel.suggest.text", { count: suggestions.length });
    if (suggestSave) {
      suggestSave.textContent = t("panel.suggest.saveCount", { count: suggestions.length });
    }
    suggestBox.hidden = false;
  };

  bindAction("save-all", () => {
    void (async () => {
      resetTransients();
      setBusy(true);
      setStatus(status, t("panel.status.saving"), "");
      let ok = false;
      try {
        const count = await captureWholeConversation(adapter, messenger, platform, root);
        ok = count > 0;
        setStatus(
          status,
          ok ? t("panel.status.savedAll", { count }) : t("panel.status.nothingToSave"),
          ok ? "ok" : "warn"
        );
      } catch (error) {
        setStatus(status, saveFailureMessage(error, t), "warn");
      } finally {
        setBusy(false);
      }
      flashIcon(shadow.querySelector('[data-gotomemory-quick="save-all"]'), ok);
    })();
  });

  bindAction("inject", () => {
    void (async () => {
      resetTransients();
      setBusy(true);
      setStatus(status, t("panel.status.searching"), "");
      let ok = false;
      try {
        const result = await injectRelevantMemories(adapter, messenger, platform, root, locale);
        ok = result.count > 0;
        setStatus(
          status,
          ok ? t("panel.status.injected", { count: result.count }) : t("panel.status.noRelevant"),
          ok ? "ok" : "warn"
        );
        if (ok) {
          showInjected(result);
          void recordMetricSafe(messenger, "inject");
        } else {
          // Nothing public matched, but private matches still deserve the gate.
          resetTransients();
          offerPrivate(result.pending);
        }
      } catch {
        setStatus(status, t("panel.status.genericError"), "warn");
      } finally {
        setBusy(false);
      }
      flashIcon(shadow.querySelector('[data-gotomemory-quick="inject"]'), ok);
    })();
  });

  shadow.querySelector('[data-gotomemory-action="export"]')?.addEventListener("click", () => {
    void (async () => {
      const choice =
        shadow.querySelector<HTMLSelectElement>("[data-gotomemory-format]")?.value ?? "markdown";
      resetTransients();
      setBusy(true);
      setStatus(status, t("panel.status.exporting"), "");
      try {
        const messages = await collectAllMessages(adapter, root);
        if (messages.length === 0) {
          setStatus(status, t("panel.status.nothingToExport"), "warn");
          return;
        }
        if (choice === "pdf-print") {
          // PDF rides the browser's print pipeline (real pagination, full CJK
          // font support) instead of a hand-rolled PDF byte-writer.
          const title = doc.title?.trim() || `${platform}-conversation`;
          if (!openPrintView(doc, toPrintableHtml({ title, messages }))) {
            setStatus(status, t("panel.status.printBlocked"), "warn");
            return;
          }
          setStatus(status, t("panel.status.printOpened"), "ok");
        } else {
          const exported = await buildConversationExport(
            adapter,
            doc,
            platform,
            choice as ExportFormat,
            root,
            messages
          );
          if (!exported) {
            setStatus(status, t("panel.status.nothingToExport"), "warn");
            return;
          }
          triggerDownload(doc, exported);
          setStatus(status, t("panel.status.exported", { filename: exported.filename }), "ok");
        }
        void recordMetricSafe(messenger, "export");
        completeOnboarding();
        offerSuggestions(messages);
      } catch {
        setStatus(status, t("panel.status.exportFailed"), "warn");
      } finally {
        setBusy(false);
      }
    })();
  });

  wireAutoCapture(shadow, adapter, messenger, platform, root, doc, status, () => t);

  // Starter templates (spec §5.0): idempotent — re-applying only adds what's missing.
  shadow.querySelector('[data-gotomemory-action="templates"]')?.addEventListener("click", () => {
    void (async () => {
      resetTransients();
      setBusy(true);
      setStatus(status, t("panel.status.addingTemplates"), "");
      try {
        const existing = await messenger.search({ limit: DRAWER_LIMIT });
        // Seed the language the user reads, not whichever one shipped first.
        const templates = pickUnappliedTemplates(existing, locale);
        if (templates.length === 0) {
          setStatus(status, t("panel.status.templatesPresent"), "ok");
          return;
        }
        await messenger.saveMany(templates.map((template) => ({ ...template })));
        setStatus(status, t("panel.status.templatesAdded", { count: templates.length }), "ok");
      } catch (error) {
        setStatus(status, saveFailureMessage(error, t), "warn");
      } finally {
        setBusy(false);
      }
    })();
  });

  // Settings gear reveals the secondary controls (templates + toggles), keeping
  // the resting panel to the four core actions.
  settingsToggle?.addEventListener("click", () => {
    const open = settingsSection?.classList.toggle("gm-open") ?? false;
    settingsToggle.classList.toggle("gm-active", open);
  });

  undoButton?.addEventListener("click", () => {
    if (lastInjectedText) {
      adapter.removeFromPrompt(lastInjectedText, root);
    }
    lastInjectedText = null;
    if (undoButton) {
      undoButton.hidden = true;
    }
    setStatus(status, t("panel.status.undone"), "");
  });

  shadow.querySelector("[data-gotomemory-suggest-save]")?.addEventListener("click", () => {
    void (async () => {
      try {
        const saved = pendingSuggestions.length;
        await messenger.saveMany(
          pendingSuggestions.map((suggestion) => ({ ...suggestion, source: platform }))
        );
        setStatus(status, t("panel.status.savedMemories", { count: saved }), "ok");
      } catch (error) {
        setStatus(status, saveFailureMessage(error, t), "warn");
      }
      pendingSuggestions = [];
      if (suggestBox) {
        suggestBox.hidden = true;
      }
    })();
  });

  shadow.querySelector("[data-gotomemory-suggest-dismiss]")?.addEventListener("click", () => {
    pendingSuggestions = [];
    if (suggestBox) {
      suggestBox.hidden = true;
    }
  });

  shadow.querySelector("[data-gotomemory-confirm-accept]")?.addEventListener("click", () => {
    const confirmed = pendingPrivate;
    pendingPrivate = [];
    if (confirmBox) {
      confirmBox.hidden = true;
    }
    if (confirmed.length === 0) {
      return;
    }
    const result = insertMemories(adapter, confirmed, root, locale);
    if (result.count === 0) {
      setStatus(status, t("panel.status.noComposer"), "warn");
      return;
    }
    // Chain the undo onto the private block so it can be pulled back out too.
    lastInjectedText = result.text;
    if (undoButton) {
      undoButton.hidden = false;
    }
    setStatus(status, t("panel.status.injectedPrivate", { count: result.count }), "ok");
    void recordMetricSafe(messenger, "inject");
  });

  shadow.querySelector("[data-gotomemory-confirm-dismiss]")?.addEventListener("click", () => {
    pendingPrivate = [];
    if (confirmBox) {
      confirmBox.hidden = true;
    }
  });

  // Trust mode (spec §6.1): zero-click inject of non-private memories with a
  // visible count and one-click undo. Private memories are never in `ready`,
  // so their manual-confirm rule is untouched in any mode.
  const autoInject = async (): Promise<void> => {
    try {
      const result = await injectRelevantMemories(adapter, messenger, platform, root, locale);
      if (result.count > 0) {
        showInjected(result);
        setStatus(status, t("panel.status.autoInjected", { count: result.count }), "ok");
        void recordMetricSafe(messenger, "inject");
      } else {
        // Trust mode still never auto-inserts private memories; surface the gate.
        offerPrivate(result.pending);
      }
    } catch {
      // trust mode must never break the page; leave the composer untouched
    }
  };

  /** Local-only counters, rendered next to the switch that controls them. */
  const renderMetrics = async (): Promise<void> => {
    if (!metricsReadout) {
      return;
    }
    if (!metricsCheckbox?.checked) {
      metricsReadout.textContent = "";
      return;
    }
    try {
      const { summary } = await messenger.getMetrics();
      metricsReadout.textContent = t("panel.metrics.readout", {
        current: summary.current_week_injects,
        average: summary.average_weekly_injects.toFixed(1)
      });
    } catch {
      metricsReadout.textContent = "";
    }
  };

  if (trustCheckbox) {
    trustCheckbox.addEventListener("change", () => {
      void updateSettingsSafe(messenger, { trust_mode: trustCheckbox.checked });
      if (trustCheckbox.checked) {
        void autoInject();
      }
    });
  }

  if (metricsCheckbox) {
    metricsCheckbox.addEventListener("change", () => {
      void updateSettingsSafe(messenger, { metrics_enabled: metricsCheckbox.checked });
      void renderMetrics();
    });
  }

  // Opening settings is when the counters are on screen; refresh them then.
  settingsToggle?.addEventListener("click", () => {
    void renderMetrics();
  });

  // Language switch: relabel in place (see applyPanelText) so the panel keeps
  // its handlers, its collapsed/expanded state, and any open drawer.
  const setLocale = (next: Locale): void => {
    if (next === locale) {
      return;
    }
    locale = next;
    t = createTranslator(locale);
    applyPanelText(shadow, t);
    applyCollapsedLabel();
    if (drawer?.classList.contains("gm-open")) {
      renderDrawer();
    }
    void renderMetrics();
  };

  // Guards the race between "stored settings arrive" and "user picks a
  // language": whoever the user chose wins, even if they beat the round-trip.
  let localeChosen = false;

  localeSelect?.addEventListener("change", () => {
    localeChosen = true;
    const preference = localeSelect.value as LocalePreference;
    void updateSettingsSafe(messenger, { locale: preference });
    setLocale(resolveLocale(preference, doc.defaultView?.navigator));
  });

  // Async init from stored settings; the conservative defaults apply until then.
  void (async () => {
    try {
      const settings = await messenger.getSettings();
      if (!localeChosen) {
        const preference: LocalePreference = settings.locale ?? "auto";
        if (localeSelect) {
          localeSelect.value = preference;
        }
        setLocale(resolveLocale(preference, doc.defaultView?.navigator));
      }
      if (trustCheckbox) {
        trustCheckbox.checked = settings.trust_mode;
      }
      if (metricsCheckbox) {
        metricsCheckbox.checked = settings.metrics_enabled;
        void renderMetrics();
      }
      if (!settings.onboarded) {
        onboardingPending = true;
        setStatus(status, t("panel.onboarding"), "");
      }
      if (settings.trust_mode) {
        await autoInject();
      }
    } catch {
      // no settings available (e.g. background unreachable): keep defaults
    }
  })();

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
    collapsed = card?.classList.toggle("gm-collapsed") ?? false;
    applyCollapsedLabel();
    // Collapsing hides the settings gear (see CSS); close the drawer it opened so
    // re-expanding starts clean and the gear's active state can't get stranded.
    if (collapsed) {
      settingsSection?.classList.remove("gm-open");
      settingsToggle?.classList.remove("gm-active");
    }
  });

  return host;
}

/**
 * PDF path: open the printable HTML in a new tab and bring up the browser's
 * print dialog — the user finishes with "另存为 PDF". Returns false when the
 * popup was blocked so the caller can tell the user what to allow.
 */
function openPrintView(doc: Document, html: string): boolean {
  const view = doc.defaultView;
  if (!view?.open) {
    return false;
  }
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const printWindow = view.open(url, "_blank");
  if (!printWindow) {
    URL.revokeObjectURL(url);
    return false;
  }
  printWindow.addEventListener?.("load", () => {
    try {
      printWindow.print();
    } catch {
      // Cmd/Ctrl+P still works in the opened tab
    }
  });
  // The blob URL must outlive the tab's load; revoke on a generous timer.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
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
  status: HTMLElement | null,
  // Read lazily: the panel's translator is replaced when the language changes,
  // and this observer outlives that swap.
  translator: () => Translator
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
            void captureNewMessages(adapter, messenger, platform, root, seen, status, translator());
          }, AUTO_CAPTURE_DEBOUNCE_MS);
        });
        observer.observe(target, { childList: true, subtree: true });
      }
      setStatus(status, translator()("panel.status.autoCaptureOn"), "ok");
    } else {
      observer?.disconnect();
      observer = null;
      clearTimeout(timer);
      setStatus(status, translator()("panel.status.autoCaptureOff"), "");
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
  status: HTMLElement | null = null,
  t: Translator = createTranslator(detectBrowserLocale())
): Promise<number> {
  let saved = 0;
  let failure: string | null = null;
  for (const message of adapter.extractMessages(root)) {
    const key = seenKey(message);
    if (seen.has(key)) {
      continue;
    }
    try {
      await messenger.save(buildSaveRequest(adapter, platform, message, root));
      // Only mark it seen once it is actually stored. Marking first meant a
      // failed save (quota, background restart) was never retried on the next
      // observer tick — the message was silently lost.
      seen.add(key);
      saved += 1;
    } catch (error) {
      failure = saveFailureMessage(error, t, "panel.status.autoSaveFailed");
    }
  }

  // Report the failure, not whichever message happened to come last: a later
  // success used to overwrite the error and hide it entirely.
  if (failure) {
    setStatus(status, failure, "warn");
  } else if (saved > 0) {
    setStatus(status, t("panel.status.autoSaved", { count: saved }), "ok");
  }
  return saved;
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

/**
 * Storage-quota failures get an actionable message instead of a generic retry —
 * chrome.storage surfaces them as "...quota exceeded" / "QUOTA_BYTES..." errors.
 */
function saveFailureMessage(
  error: unknown,
  t: Translator,
  fallback: MessageKey = "panel.status.genericError"
): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return t(/quota/i.test(message) ? "panel.status.quotaFull" : fallback);
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

/**
 * The two-level memory library rendered inside the drawer: conversations at
 * level 1 (title + last-line preview), one conversation's full record at
 * level 2. Pure DOM rendering against the background messenger; mount.ts owns
 * when to (re)render.
 */

import type { Memory } from "@gotomemory/contracts";
import { localeTag, type Locale, type Translator } from "@gotomemory/i18n";

import type { createRuntimeMessenger } from "./messaging.js";

type Messenger = ReturnType<typeof createRuntimeMessenger>;

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
export const DRAWER_LIMIT = 10000;

/**
 * Group memories by their conversation.
 *
 * Groups keep the order they arrive in (search relevance, then recency), but
 * the messages *inside* a group are re-sorted oldest-first. The store lists
 * newest-first, so rendering a group in arrival order replayed the whole
 * conversation backwards and made the "last message" preview show the first one.
 */
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

  for (const group of groups.values()) {
    group.items.sort(byChronology);
  }
  return [...groups.values()];
}

/** Oldest first; `created_at` carries the message's original generation time. */
function byChronology(left: Memory, right: Memory): number {
  const delta = left.created_at.localeCompare(right.created_at);
  // Same-second saves (a bulk import) fall back to the id so the order is stable.
  return delta !== 0 ? delta : left.id.localeCompare(right.id);
}

export interface LibraryViewOptions {
  detailKey: string | null;
  query: string;
  locale: Locale;
  t: Translator;
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
export async function renderMemoryLibrary(
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
        options.drawerTitle.textContent = groupLabel(group, options.t);
      }
      renderConversationDetail(container, doc, group, messenger, options);
      return;
    }

    if (options.drawerTitle) {
      options.drawerTitle.textContent = options.t("library.title");
    }
    container.replaceChildren();
    if (conversations.length === 0) {
      const empty = doc.createElement("div");
      empty.className = "gm-empty";
      empty.textContent = options.t(query ? "library.noMatches" : "library.empty");
      container.append(empty);
      return;
    }
    for (const group of conversations) {
      container.append(conversationRow(doc, group, messenger, options));
    }
  } catch {
    const error = doc.createElement("div");
    error.className = "gm-empty";
    error.textContent = options.t("library.loadFailed");
    container.replaceChildren(error);
  }
}

/** Level 1 row: conversation title, a preview of the last message, and count. */
function conversationRow(
  doc: Document,
  group: ConversationGroup,
  messenger: Messenger,
  options: LibraryViewOptions
): HTMLElement {
  const { t } = options;
  const row = doc.createElement("div");
  row.className = "gm-conv";
  row.setAttribute("data-gotomemory-conversation", group.key);
  row.addEventListener("click", () => options.openDetail(group.key));

  const main = doc.createElement("div");
  main.className = "gm-conv-main";

  const titleRow = doc.createElement("div");
  titleRow.className = "gm-conv-title-row";
  const title = doc.createElement("span");
  title.className = "gm-conv-title";
  title.textContent = groupLabel(group, t);
  const time = doc.createElement("span");
  time.className = "gm-conv-time";
  time.textContent = conversationTime(group, options.locale, t);
  time.setAttribute("data-gotomemory-time", "");
  titleRow.append(title, time);

  const last = group.items[group.items.length - 1];
  const preview = doc.createElement("div");
  preview.className = "gm-conv-preview";
  const speaker =
    last?.role === "assistant"
      ? t("library.previewAi")
      : last?.role === "user"
        ? t("library.previewMe")
        : "";
  preview.textContent = last ? `${speaker}${last.content}` : "";

  main.append(titleRow, preview);

  const side = doc.createElement("div");
  side.className = "gm-conv-side";
  const count = doc.createElement("span");
  count.className = "gm-conv-count";
  count.textContent = t("library.count", { count: group.items.length });

  const remove = doc.createElement("button");
  remove.type = "button";
  remove.className = "gm-detail-del";
  remove.title = t("library.deleteGroup");
  remove.setAttribute("aria-label", t("library.deleteGroup"));
  remove.textContent = "🗑";
  remove.addEventListener("click", (event) => {
    event.stopPropagation();
    void deleteGroup(doc, group, messenger, options);
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
  options: LibraryViewOptions
): void {
  const { t } = options;
  container.replaceChildren();

  const meta = doc.createElement("div");
  meta.className = "gm-detail-meta";

  const count = doc.createElement("span");
  count.className = "gm-conv-count";
  count.textContent = t("library.count", { count: group.items.length });
  meta.append(count);

  if (group.url) {
    const link = doc.createElement("a");
    link.className = "gm-detail-link";
    link.textContent = t("library.openOriginal");
    link.href = group.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    meta.append(link);
  }

  const removeAll = doc.createElement("button");
  removeAll.type = "button";
  removeAll.className = "gm-detail-del";
  removeAll.textContent = t("library.deleteGroup");
  removeAll.addEventListener("click", () => {
    void deleteGroup(doc, group, messenger, options);
  });
  meta.append(removeAll);

  container.append(meta);
  for (const memory of group.items) {
    container.append(memoryItem(doc, memory, messenger, options));
  }
}

/**
 * Delete a whole conversation: confirm first (this is irreversible and one
 * mis-click used to wipe the group), then remove it in a single batch call —
 * per-id removes rewrote the entire storage blob once per memory and could
 * leave the group half-deleted if one failed.
 */
async function deleteGroup(
  doc: Document,
  group: ConversationGroup,
  messenger: Messenger,
  options: LibraryViewOptions
): Promise<void> {
  const confirmed = doc.defaultView?.confirm?.(
    options.t("library.deleteGroupConfirm", {
      title: groupLabel(group, options.t),
      count: group.items.length
    })
  );
  if (confirmed === false) {
    return;
  }
  await messenger.removeMany(group.items.map((item) => item.id));
  options.refresh();
}

function groupLabel(group: ConversationGroup, t: Translator): string {
  if (group.title) {
    return group.title;
  }
  if (group.key === LOOSE_GROUP || group.key.startsWith(`${LOOSE_GROUP}:`)) {
    return t("library.untitled");
  }
  return t("library.conversation", { id: group.key.slice(0, 8) });
}

function memoryItem(
  doc: Document,
  memory: Memory,
  messenger: Messenger,
  options: LibraryViewOptions
): HTMLElement {
  const { t } = options;
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
    role.textContent = t(memory.role === "assistant" ? "library.roleAi" : "library.roleMe");
    tags.append(role);
  }
  const source = doc.createElement("span");
  source.className = "gm-tag";
  source.textContent = memory.source;
  tags.append(source);

  // The privacy gate needs a way to mark something private. Without this,
  // `is_private` was never true, so the confirm-before-inject rule covered
  // nothing and this tag could never appear.
  const priv = doc.createElement("button");
  priv.type = "button";
  priv.className = memory.is_private ? "gm-tag gm-private gm-tag-on" : "gm-tag gm-tag-toggle";
  priv.textContent = t("library.private");
  priv.title = t(memory.is_private ? "library.privateOn" : "library.privateOff");
  priv.setAttribute("aria-pressed", String(Boolean(memory.is_private)));
  priv.setAttribute("data-gotomemory-private", memory.id);
  priv.addEventListener("click", () => {
    void (async () => {
      await messenger.update(memory.id, { is_private: !memory.is_private });
      options.refresh();
    })();
  });
  tags.append(priv);

  const right = doc.createElement("div");
  right.className = "gm-item-right";
  const time = doc.createElement("span");
  time.className = "gm-item-time";
  time.textContent = formatTimestamp(memory.created_at, options.locale, t);
  time.setAttribute("data-gotomemory-time", "");

  const del = doc.createElement("button");
  del.type = "button";
  del.className = "gm-del";
  del.title = t("library.delete");
  del.setAttribute("aria-label", t("library.delete"));
  del.textContent = "✕";
  del.setAttribute("data-gotomemory-delete", memory.id);
  del.addEventListener("click", () => {
    void (async () => {
      await messenger.remove(memory.id);
      options.refresh();
    })();
  });

  right.append(time, del);
  foot.append(tags, right);
  row.append(text, foot);
  return row;
}

/**
 * Friendly local time: today shows the clock, this year shows month/day, older
 * shows the year. The date part goes through Intl so "3月4日" and "Mar 4" both
 * read naturally; the clock stays 24-hour in both languages, matching the
 * compact single-line layout.
 */
function formatTimestamp(iso: string, locale: Locale, t: Translator): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const now = new Date();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;
  if (date.toDateString() === now.toDateString()) {
    return t("library.today", { time });
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  const dateLabel = new Intl.DateTimeFormat(localeTag(locale), {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" })
  }).format(date);
  return sameYear ? `${dateLabel} ${time}` : dateLabel;
}

/** The most recent activity time of a conversation (its latest saved message). */
function conversationTime(group: ConversationGroup, locale: Locale, t: Translator): string {
  const latest = group.items.reduce((newest, item) =>
    item.created_at > newest.created_at ? item : newest
  );
  return formatTimestamp(latest.created_at, locale, t);
}

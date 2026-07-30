import {
  ChromeStorageDriver,
  InMemoryMemoryStore,
  PersistentJsonMemoryStore,
  type ChromeStorageArea,
  type MemoryStore
} from "@gotomemory/store";
import { defineBackground } from "wxt/sandbox";

import { createBackgroundHandlers } from "../src/handlers.js";
import { ChromeKeyValueStore, InMemoryKeyValueStore, type KeyValueStore } from "../src/kv.js";
import type { ExtensionMessage } from "../src/messaging.js";
import { refreshSelectorOverrides } from "../src/selector-config.js";

interface MessageSender {
  id?: string;
}

declare const chrome:
  | {
      runtime?: {
        id?: string;
        onMessage?: {
          addListener: (
            callback: (
              message: ExtensionMessage,
              sender: MessageSender,
              sendResponse: (response: unknown) => void
            ) => boolean
          ) => void;
        };
      };
      storage?: {
        local?: ChromeStorageArea;
      };
    }
  | undefined;

// Local-first persistence (spec §6.3/§7): the memory store must live in the
// extension's own context and survive service-worker eviction. Use
// chrome.storage.local when available; fall back to in-memory only when the
// storage API is missing (e.g. non-extension test contexts).
function createStore(): MemoryStore {
  const area = chrome?.storage?.local;
  return area
    ? new PersistentJsonMemoryStore(new ChromeStorageDriver(area))
    : new InMemoryMemoryStore();
}

function createKv(): KeyValueStore {
  const area = chrome?.storage?.local;
  return area ? new ChromeKeyValueStore(area) : new InMemoryKeyValueStore();
}

export default defineBackground(() => {
  const kv = createKv();
  const handleMessage = createBackgroundHandlers({ store: createStore(), kv });

  // Selector hot-fix channel (monorepo spec §7): refresh on every service-worker
  // start. Failures fall back to the built-in selectors; nothing blocks on it.
  void refreshSelectorOverrides({ kv });

  const ownId = chrome?.runtime?.id;

  chrome?.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    // Reject anything not from this extension's own contexts (content scripts,
    // popup, panel). No externally_connectable or page bridge exists today, but
    // this is the only layer standing between a future one and direct access to
    // memory.removeMany/etc — cheap to enforce now, easy to forget once needed.
    if (ownId !== undefined && sender.id !== ownId) {
      sendResponse({ ok: false, error: "unauthorized sender" });
      return false;
    }
    void handleMessage(message).then(sendResponse);
    return true;
  });
});

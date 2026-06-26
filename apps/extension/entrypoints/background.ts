import {
  ChromeStorageDriver,
  InMemoryMemoryStore,
  PersistentJsonMemoryStore,
  type ChromeStorageArea,
  type MemoryStore
} from "@gotomemory/store";

import { createBackgroundHandlers } from "../src/handlers.js";
import type { ExtensionMessage } from "../src/messaging.js";

declare const chrome:
  | {
      runtime?: {
        onMessage?: {
          addListener: (
            callback: (
              message: ExtensionMessage,
              sender: unknown,
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

const handleMessage = createBackgroundHandlers({ store: createStore() });

chrome?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  void handleMessage(message).then(sendResponse);
  return true;
});

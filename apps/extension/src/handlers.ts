import { makeMemoryService } from "@gotomemory/core";
import { KeywordRetrievalEngine, type RetrievalEngine } from "@gotomemory/retrieval";
import { InMemoryMemoryStore, type MemoryStore } from "@gotomemory/store";

import type { ExtensionMessage, ExtensionMessageResponse } from "./messaging.js";

export interface BackgroundHandlerDeps {
  store?: MemoryStore;
  retrieval?: RetrievalEngine;
}

export function createBackgroundHandlers(deps: BackgroundHandlerDeps = {}) {
  const service = makeMemoryService({
    store: deps.store ?? new InMemoryMemoryStore(),
    retrieval: deps.retrieval ?? new KeywordRetrievalEngine()
  });

  return async function handleMessage(
    message: ExtensionMessage
  ): Promise<ExtensionMessageResponse> {
    try {
      switch (message.type) {
        case "memory.save":
          return { ok: true, value: await service.save(message.input) };
        case "memory.saveMany":
          return { ok: true, value: await service.saveMany(message.input) };
        case "memory.search":
          return { ok: true, value: await service.search(message.input) };
        case "memory.context":
          return { ok: true, value: await service.context(message.input) };
        case "memory.update":
          return { ok: true, value: await service.update(message.id, message.input) };
        case "memory.remove":
          await service.remove(message.id);
          return { ok: true, value: null };
        case "memory.pause":
          await service.pause(message.id, message.input);
          return { ok: true, value: null };
        case "memory.resume":
          await service.resume(message.id, message.input);
          return { ok: true, value: null };
        default:
          return { ok: false, error: `unknown message: ${(message as { type: string }).type}` };
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "unknown error" };
    }
  };
}

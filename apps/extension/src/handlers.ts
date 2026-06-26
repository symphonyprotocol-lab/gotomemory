import { makeMemoryService } from "@gotomemory/core";
import { KeywordRetrievalEngine } from "@gotomemory/retrieval";
import { InMemoryMemoryStore } from "@gotomemory/store";

import type { ExtensionMessage, ExtensionMessageResponse } from "./messaging.js";

export function createBackgroundHandlers() {
  const service = makeMemoryService({
    store: new InMemoryMemoryStore(),
    retrieval: new KeywordRetrievalEngine()
  });

  return async function handleMessage(
    message: ExtensionMessage
  ): Promise<ExtensionMessageResponse> {
    try {
      switch (message.type) {
        case "memory.save":
          return { ok: true, value: await service.save(message.input) };
        case "memory.context":
          return { ok: true, value: await service.context(message.input) };
        case "memory.pause":
          await service.pause(message.id, message.input);
          return { ok: true, value: null };
        case "memory.resume":
          await service.resume(message.id, message.input);
          return { ok: true, value: null };
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "unknown error" };
    }
  };
}

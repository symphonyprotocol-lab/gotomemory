import {
  ChromeStorageDriver,
  PersistentJsonMemoryStore,
  type ChromeStorageArea
} from "@gotomemory/store";
import { describe, expect, it } from "vitest";

import { createBackgroundHandlers } from "./handlers.js";
import { createRuntimeMessenger } from "./messaging.js";

describe("extension messaging", () => {
  it("saves memory and builds context through typed runtime messages", async () => {
    const handle = createBackgroundHandlers();
    const messenger = createRuntimeMessenger(handle);

    const saved = await messenger.save({ content: "Prefer TypeScript", source: "chatgpt" });
    const context = await messenger.context({ platform: "claude", topic: "typescript" });

    expect(saved.content).toBe("Prefer TypeScript");
    expect(context.ready.map((memory) => memory.id)).toEqual([saved.id]);
  });

  it("persists memories across service-worker restarts via the injected store", async () => {
    // Local-first guarantee (spec §6.3/§7): a saved memory must survive the
    // background being torn down and re-created. Share one backing storage area
    // between two handler instances to simulate service-worker eviction.
    const backing: Record<string, unknown> = {};
    const area: ChromeStorageArea = {
      async get(key) {
        return typeof key === "string" ? { [key]: backing[key] } : { ...backing };
      },
      async set(items) {
        Object.assign(backing, items);
      }
    };
    const makeMessenger = () =>
      createRuntimeMessenger(
        createBackgroundHandlers({
          store: new PersistentJsonMemoryStore(new ChromeStorageDriver(area))
        })
      );

    const saved = await makeMessenger().save({ content: "Prefer TypeScript", source: "chatgpt" });

    const afterRestart = await makeMessenger().context({ platform: "claude", topic: "typescript" });
    expect(afterRestart.ready.map((memory) => memory.id)).toEqual([saved.id]);
  });
});

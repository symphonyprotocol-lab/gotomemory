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
});

import { describe, expect, it } from "vitest";

import { GotomemorySdk, buildContextPrompt } from "./index.js";

describe("TypeScript SDK", () => {
  it("builds prompt context for developer integrations", () => {
    expect(buildContextPrompt([{ content: "Use TypeScript" }])).toContain("Use TypeScript");
  });

  it("creates conversation shares through the generated client", async () => {
    const sdk = new GotomemorySdk({
      baseUrl: "https://api.test",
      fetch: async () =>
        new Response(
          JSON.stringify({
            id: "sc_1",
            url: "https://gotomemory.dev/p/abcdefghijklmnopqrstuv",
            visibility: "public",
            status: "active",
            expires_at: null
          })
        )
    });

    await expect(
      sdk.shareConversation([{ role: "assistant", content: "done" }], "Demo")
    ).resolves.toMatchObject({ id: "sc_1" });
  });
});

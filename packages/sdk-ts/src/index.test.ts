import { describe, expect, it } from "vitest";

import { GotomemorySdk, buildContextPrompt } from "./index.js";

describe("TypeScript SDK", () => {
  it("builds prompt context for developer integrations", () => {
    expect(buildContextPrompt([{ content: "Use TypeScript" }])).toContain("Use TypeScript");
  });

  it("saves memories through the generated client", async () => {
    let captured: { url: string; method: string; body: string } | undefined;
    const sdk = new GotomemorySdk({
      baseUrl: "https://api.test",
      fetch: async (input, init) => {
        captured = {
          url: String(input),
          method: init?.method ?? "GET",
          body: String(init?.body ?? "")
        };
        return new Response(
          JSON.stringify({
            id: "mem_1",
            user_id: "local",
            content: "Use TypeScript",
            category: "preference",
            is_private: false,
            source: "chatgpt",
            rev: 0,
            created_at: "2026-06-25T00:00:00.000Z",
            updated_at: "2026-06-25T00:00:00.000Z"
          })
        );
      }
    });

    await expect(
      sdk.saveMemory({ content: "Use TypeScript", source: "chatgpt" })
    ).resolves.toMatchObject({ id: "mem_1" });
    expect(captured?.method).toBe("POST");
    expect(captured?.url).toBe("https://api.test/v1/memories");
  });
});

import { describe, expect, it } from "vitest";

import { hostPermissions } from "./manifest.js";

describe("extension manifest", () => {
  it("uses exact AI assistant host permissions only", () => {
    expect(hostPermissions).toEqual([
      "https://chatgpt.com/*",
      "https://claude.ai/*",
      "https://gemini.google.com/*"
    ]);
  });
});

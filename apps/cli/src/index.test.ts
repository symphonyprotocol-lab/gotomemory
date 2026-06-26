import { describe, expect, it } from "vitest";

import { runCli } from "./index.js";

describe("gotomemory CLI", () => {
  it("builds context prompts from memory arguments", () => {
    expect(runCli(["build-context", "Use TypeScript"])).toContain("- Use TypeScript");
  });

  it("prints help for unknown commands", () => {
    expect(runCli(["unknown"])).toContain("Commands:");
  });
});

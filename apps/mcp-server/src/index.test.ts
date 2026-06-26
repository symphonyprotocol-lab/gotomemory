import { describe, expect, it } from "vitest";

import { handleMcpRequest } from "./index.js";

describe("MCP server JSON-RPC handlers", () => {
  it("lists gotomemory tools", async () => {
    const response = await handleMcpRequest({ id: 1, method: "tools/list" });

    const result = response.result as { tools: Array<{ name: string }> };
    expect(result.tools[0]?.name).toBe("build_context");
  });

  it("calls build_context", async () => {
    const response = await handleMcpRequest({
      id: 2,
      method: "tools/call",
      params: {
        name: "build_context",
        arguments: { memories: ["Use TypeScript"] }
      }
    });

    const result = response.result as { content: Array<{ text: string }> };
    expect(result.content[0]?.text).toContain("Use TypeScript");
  });
});

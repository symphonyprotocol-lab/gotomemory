import type { GotomemoryClient } from "@gotomemory/sdk";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildContext, readMemory, saveMemory, searchMemory } from "./handlers.js";

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

/** Register the governed memory tools (system spec §16.1) on an McpServer. */
export function registerTools(server: McpServer, client: GotomemoryClient): void {
  server.tool(
    "search_memory",
    { query: z.string(), scope: z.array(z.string()).optional(), limit: z.number().optional() },
    async (args) => text(await searchMemory(client, args)),
  );

  server.tool("read_memory", { id: z.string(), purpose: z.string() }, async (args) =>
    text(await readMemory(client, args)),
  );

  server.tool(
    "save_memory",
    {
      content: z.string(),
      type: z.string(),
      scope: z.string().optional(),
      sensitivity: z.string().optional(),
    },
    async (args) => text(await saveMemory(client, args)),
  );

  server.tool(
    "build_context",
    { task: z.string(), platform: z.string().optional(), token_budget: z.number().optional() },
    async (args) => text(await buildContext(client, args)),
  );
}

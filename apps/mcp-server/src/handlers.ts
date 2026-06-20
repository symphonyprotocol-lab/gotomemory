import type { CreateMemoryRequest, GotomemoryClient, SearchRequest } from "@gotomemory/sdk";

/**
 * Tool handler logic, independent of the MCP transport so it can be unit-tested with a
 * fake client. Every tool routes through the SDK → Gateway; the MCP server never touches
 * storage directly (system spec §19.1).
 */

export interface SearchArgs {
  query: string;
  scope?: string[];
  limit?: number;
}

export async function searchMemory(client: GotomemoryClient, args: SearchArgs): Promise<string> {
  const res = await client.memories.search({
    query: args.query,
    scope: args.scope as SearchRequest["scope"],
    limit: args.limit ?? 12,
  });
  return JSON.stringify(res, null, 2);
}

export interface ReadArgs {
  id: string;
  purpose: string;
}

export async function readMemory(client: GotomemoryClient, args: ReadArgs): Promise<string> {
  return JSON.stringify(await client.memories.read(args.id, args.purpose), null, 2);
}

export interface SaveArgs {
  content: string;
  type: string;
  scope?: string;
  sensitivity?: string;
}

export async function saveMemory(client: GotomemoryClient, args: SaveArgs): Promise<string> {
  const res = await client.memories.create({
    content: args.content,
    type: args.type as CreateMemoryRequest["type"],
    scope: (args.scope ?? "personal") as CreateMemoryRequest["scope"],
    source: "api",
    ...(args.sensitivity
      ? { sensitivity: args.sensitivity as CreateMemoryRequest["sensitivity"] }
      : {}),
  });
  return JSON.stringify(res, null, 2);
}

export interface BuildArgs {
  task: string;
  platform?: string;
  token_budget?: number;
}

export async function buildContext(client: GotomemoryClient, args: BuildArgs): Promise<string> {
  const res = await client.context.build({
    task: args.task,
    platform: (args.platform ?? "claude") as "chatgpt" | "claude" | "gemini",
    client_id: "mcp-server",
    token_budget: args.token_budget ?? 1200,
  });
  return JSON.stringify(res, null, 2);
}

import type {
  ContextConfirmRequest,
  CreatePageRequest,
  CreateMemoryRequest,
  GotomemoryClient,
  SearchRequest,
  UpdatePageRequest,
} from "@gotomemory/sdk";

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

export interface SaveConversationSummaryArgs {
  summary: string;
  topic?: string;
  sensitivity?: string;
}

export async function saveConversationSummary(
  client: GotomemoryClient,
  args: SaveConversationSummaryArgs,
): Promise<string> {
  const content = args.topic?.trim() ? `${args.topic.trim()}: ${args.summary}` : args.summary;
  return saveMemory(client, {
    content,
    type: "note",
    scope: "personal",
    ...(args.sensitivity ? { sensitivity: args.sensitivity } : {}),
  });
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

export async function buildMemoryContext(
  client: GotomemoryClient,
  args: BuildArgs,
): Promise<string> {
  return buildContext(client, { ...args, platform: args.platform ?? "chatgpt" });
}

export interface ConfirmArgs {
  decision_id: string;
  confirmation_token: string;
  confirmed_memory_ids: string[];
}

export async function confirmContext(client: GotomemoryClient, args: ConfirmArgs): Promise<string> {
  const res = await client.context.confirm(args as ContextConfirmRequest);
  return JSON.stringify(res, null, 2);
}

export interface SharePageArgs {
  title: string;
  kind: string;
  content?: string;
  content_base64?: string;
  filename?: string;
  description?: string;
  visibility?: string;
  expires_in?: { value: number; unit: "hours" | "days" };
  ttl_hours?: number;
}

export async function shareGeneratedPage(
  client: GotomemoryClient,
  args: SharePageArgs,
): Promise<string> {
  const res = await client.pages.create({
    title: args.title,
    kind: args.kind as CreatePageRequest["kind"],
    ...(args.content !== undefined ? { content: args.content } : {}),
    ...(args.content_base64 !== undefined ? { content_base64: args.content_base64 } : {}),
    ...(args.filename ? { filename: args.filename } : {}),
    ...(args.description ? { description: args.description } : {}),
    ...(args.visibility ? { visibility: args.visibility as CreatePageRequest["visibility"] } : {}),
    ...(args.expires_in ? { expires_in: args.expires_in } : {}),
    ...(args.ttl_hours ? { ttl_hours: args.ttl_hours } : {}),
    source: "mcp",
  });
  return JSON.stringify(res, null, 2);
}

export async function sharePageKind(
  client: GotomemoryClient,
  kind: CreatePageRequest["kind"],
  args: Omit<SharePageArgs, "kind">,
): Promise<string> {
  return shareGeneratedPage(client, { ...args, kind });
}

export interface ListPagesArgs {
  limit?: number;
}

export async function listSharedPages(
  client: GotomemoryClient,
  args: ListPagesArgs = {},
): Promise<string> {
  return JSON.stringify(await client.pages.list(args.limit ?? 20), null, 2);
}

export interface GetPageArgs {
  id: string;
}

export async function getSharedPage(client: GotomemoryClient, args: GetPageArgs): Promise<string> {
  return JSON.stringify(await client.pages.get(args.id), null, 2);
}

export interface UnpublishPageArgs {
  id: string;
}

export async function unpublishSharedPage(
  client: GotomemoryClient,
  args: UnpublishPageArgs,
): Promise<string> {
  await client.pages.unpublish(args.id);
  return JSON.stringify({ id: args.id, status: "unpublished" }, null, 2);
}

export interface UpdatePageArgs {
  id: string;
  version: number;
  title?: string;
  description?: string | null;
  visibility?: string;
  expires_at?: string | null;
  status?: string;
}

export async function updateSharedPageMetadata(
  client: GotomemoryClient,
  args: UpdatePageArgs,
): Promise<string> {
  const body: UpdatePageRequest = {
    version: args.version,
    ...(args.title ? { title: args.title } : {}),
    ...(args.description !== undefined ? { description: args.description } : {}),
    ...(args.visibility ? { visibility: args.visibility as UpdatePageRequest["visibility"] } : {}),
    ...(args.expires_at !== undefined ? { expires_at: args.expires_at } : {}),
    ...(args.status ? { status: args.status as UpdatePageRequest["status"] } : {}),
  };
  return JSON.stringify(await client.pages.update(args.id, body), null, 2);
}

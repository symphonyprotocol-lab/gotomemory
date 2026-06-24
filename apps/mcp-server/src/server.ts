import type { GotomemoryClient } from "@gotomemory/sdk";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  buildContext,
  buildMemoryContext,
  confirmContext,
  getSharedPage,
  listSharedPages,
  readMemory,
  saveConversationSummary,
  saveMemory,
  searchMemory,
  shareGeneratedPage,
  sharePageKind,
  unpublishSharedPage,
  updateSharedPageMetadata,
} from "./handlers.js";

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

function promptText(value: string) {
  return {
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text: value },
      },
    ],
  };
}

function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "gotomemory",
    {
      title: "gotomemory",
      description: "Use governed memory for the current task.",
      argsSchema: {
        task: z.string().optional().describe("Task or memory action to perform"),
      },
    },
    ({ task }) =>
      promptText(
        [
          "Use gotomemory for this task.",
          `Task: ${task?.trim() || "Use the current conversation task."}`,
          "Choose the most appropriate gotomemory tool: search_memory, read_memory, save_memory, build_context, or confirm_context.",
          "If the task asks to summarize, remember, or save this conversation, summarize the visible conversation into a concise durable memory and call save_memory.",
          "For conversation summaries, use type=note and scope=personal unless the content is clearly a preference or instruction.",
          "Do not save passwords, API keys, or other secrets. If the summary contains private or sensitive details, ask me before saving.",
          "For context-building tasks, call build_context with platform=claude.",
          "If build_context returns requires_confirmation=true, show the confirmation preview and ask me which memories to include before calling confirm_context.",
          "Never inject omitted memories, especially memories omitted for sensitivity or policy reasons.",
          "After context is built or confirmed, use only the returned context that is appropriate for the task.",
        ].join("\n"),
      ),
  );

  server.registerPrompt(
    "gotomemory-summary",
    {
      title: "gotomemory-summary",
      description: "Summarize the visible conversation and save it as memory.",
      argsSchema: {
        topic: z.string().optional().describe("Optional topic or label for the summary"),
      },
    },
    ({ topic }) =>
      promptText(
        [
          "Summarize the visible conversation and save it to gotomemory.",
          topic?.trim() ? `Topic: ${topic.trim()}` : "Topic: infer a concise topic.",
          "Create a durable, compact summary that will still make sense later.",
          "Use save_memory with type=note and scope=personal unless the content is clearly a preference or instruction.",
          "If the summary includes private or sensitive details, ask me before saving.",
          "Do not save passwords, API keys, tokens, or credentials.",
          "After saving, briefly report the saved memory id and what was saved.",
        ].join("\n"),
      ),
  );

  server.registerPrompt(
    "gotomemory-build-context",
    {
      title: "gotomemory-build-context",
      description: "Build governed memory context for a task.",
      argsSchema: {
        task: z.string().describe("Task to build memory context for"),
        token_budget: z.string().optional().describe("Optional token budget, default 1200"),
      },
    },
    ({ task, token_budget }) =>
      promptText(
        [
          "Build gotomemory context for the task below.",
          `Task: ${task}`,
          `Token budget: ${token_budget?.trim() || "1200"}`,
          "Call build_context with platform=claude and the requested token budget.",
          "If requires_confirmation=true, show the confirmation preview and ask me which memories to include before calling confirm_context.",
          "Never include omitted memories in your answer.",
        ].join("\n"),
      ),
  );

  server.registerPrompt(
    "gotomemory-save",
    {
      title: "gotomemory-save",
      description: "Save a fact, preference, instruction, or note to memory.",
      argsSchema: {
        content: z.string().describe("Content to save"),
        type: z
          .string()
          .optional()
          .describe("preference, fact, note, instruction, or credential_hint"),
      },
    },
    ({ content, type }) =>
      promptText(
        [
          "Save the following content to gotomemory.",
          `Content: ${content}`,
          `Type: ${type?.trim() || "infer the best type; default to note if unsure"}`,
          "Use save_memory with scope=personal.",
          "Do not save passwords, API keys, tokens, or credentials. If the content appears sensitive, ask me before saving.",
          "After saving, briefly report the saved memory id.",
        ].join("\n"),
      ),
  );

  server.registerPrompt(
    "gotomemory-search",
    {
      title: "gotomemory-search",
      description: "Search gotomemory by query.",
      argsSchema: {
        query: z.string().describe("Search query"),
        limit: z.string().optional().describe("Optional result limit, default 12"),
      },
    },
    ({ query, limit }) =>
      promptText(
        [
          "Search gotomemory.",
          `Query: ${query}`,
          `Limit: ${limit?.trim() || "12"}`,
          "Call search_memory and summarize the results. Do not imply you have full content unless you call read_memory with a purpose.",
        ].join("\n"),
      ),
  );

  server.registerPrompt(
    "gotomemory-read",
    {
      title: "gotomemory-read",
      description: "Read a specific memory by id with a purpose.",
      argsSchema: {
        id: z.string().describe("Memory id to read"),
        purpose: z.string().describe("Why the full content is needed"),
      },
    },
    ({ id, purpose }) =>
      promptText(
        [
          "Read a gotomemory memory.",
          `Memory id: ${id}`,
          `Purpose: ${purpose}`,
          "Call read_memory with this id and purpose, then summarize only what is relevant to the purpose.",
        ].join("\n"),
      ),
  );

  server.registerPrompt(
    "gotomemory-confirm",
    {
      title: "gotomemory-confirm",
      description: "Confirm selected memories after build_context asks for confirmation.",
      argsSchema: {
        decision_id: z.string().describe("Decision id from build_context"),
        confirmation_token: z.string().describe("Confirmation token from build_context"),
        ids: z.string().describe("Comma-separated memory ids to confirm"),
      },
    },
    ({ decision_id, confirmation_token, ids }) =>
      promptText(
        [
          "Confirm selected gotomemory memories.",
          `Decision id: ${decision_id}`,
          `Confirmation token: ${confirmation_token}`,
          `Memory ids: ${ids}`,
          "Call confirm_context with confirmed_memory_ids parsed from the comma-separated list.",
          "After confirming, use only the returned context and report any omitted memories.",
        ].join("\n"),
      ),
  );

  server.registerPrompt(
    "gotomemory-share-page",
    {
      title: "gotomemory-share-page",
      description:
        "Publish generated HTML, Markdown, PDF, Word, Excel, or PowerPoint as a read-only shared page.",
      argsSchema: {
        title: z.string().describe("Share page title"),
        kind: z.string().describe("html, markdown, pdf, docx, xlsx, or pptx"),
      },
    },
    ({ title, kind }) =>
      promptText(
        [
          "Publish the generated artifact as a gotomemory read-only shared page.",
          `Title: ${title}`,
          `Kind: ${kind}`,
          "Choose the most specific page sharing tool: share_html_page, share_markdown_page, share_pdf_page, share_word_document, share_excel_workbook, share_powerpoint_deck, or share_generated_page.",
          "If the user gave an expiration such as 2 hours or 1 day, pass expires_in with unit hours or days. If no expiration was given, omit expires_in for a permanent share.",
          "After publishing, return the share URL.",
        ].join("\n"),
      ),
  );
}

/** Register the governed memory tools (system spec §16.1) on an McpServer. */
export function registerTools(server: McpServer, client: GotomemoryClient): void {
  registerPrompts(server);

  const searchInput = {
    query: z.string().describe("Natural language query to search for relevant memories"),
    scope: z.array(z.string()).optional().describe("Optional memory scopes to search"),
    limit: z.number().optional().describe("Maximum number of preview results to return"),
  };
  const readInput = {
    id: z.string().describe("Memory id to read"),
    purpose: z.string().describe("Why full memory content is needed"),
  };
  const saveInput = {
    content: z.string().describe("Memory content to save"),
    type: z
      .string()
      .describe("Memory type: preference, fact, note, instruction, or credential_hint"),
    scope: z.string().optional().describe("Memory scope, defaults to personal"),
    sensitivity: z
      .string()
      .optional()
      .describe("Optional sensitivity override: public, normal, private, or secret"),
  };
  const buildInput = {
    task: z.string().describe("Task that needs memory context"),
    platform: z.string().optional().describe("Target platform: chatgpt, claude, or gemini"),
    token_budget: z.number().optional().describe("Maximum token budget for returned context"),
  };
  const confirmInput = {
    decision_id: z.string().describe("Decision id returned by build_context"),
    confirmation_token: z
      .string()
      .describe("One-time confirmation token returned by build_context"),
    confirmed_memory_ids: z.array(z.string()).describe("Memory ids approved by the user"),
  };
  const expiresInput = z
    .object({ value: z.number().int().positive(), unit: z.enum(["hours", "days"]) })
    .optional()
    .describe("Optional share lifetime; omit for permanent sharing");
  const pageInput = {
    title: z.string().describe("Shared page title"),
    kind: z.string().describe("html, markdown, pdf, docx, xlsx, or pptx"),
    content: z.string().optional().describe("Text content or base64 file payload for the page"),
    content_base64: z.string().optional().describe("Base64-encoded file content"),
    filename: z.string().optional().describe("Original filename"),
    description: z.string().optional().describe("Optional page description"),
    visibility: z
      .enum(["private", "unlisted", "public"])
      .optional()
      .describe("Page visibility, defaults to unlisted"),
    expires_in: expiresInput,
    ttl_hours: z.number().int().positive().optional().describe("Deprecated hour-based TTL alias"),
  };
  const pageSpecificInput = {
    title: pageInput.title,
    content: pageInput.content,
    content_base64: pageInput.content_base64,
    filename: pageInput.filename,
    description: pageInput.description,
    visibility: pageInput.visibility,
    expires_in: expiresInput,
    ttl_hours: pageInput.ttl_hours,
  };

  server.registerTool(
    "search_memory",
    {
      title: "Search memory",
      description:
        "Search gotomemory for relevant governed memories. Returns safe previews, not full memory content.",
      inputSchema: searchInput,
    },
    async (args) => text(await searchMemory(client, args)),
  );

  server.registerTool(
    "search_user_memory",
    {
      title: "Search user memory",
      description:
        "Semantic alias for searching the user's gotomemory store from natural language.",
      inputSchema: searchInput,
    },
    async (args) => text(await searchMemory(client, args)),
  );

  server.registerTool(
    "read_memory",
    {
      title: "Read memory",
      description:
        "Read the full content of a specific memory id. Requires a purpose for auditability.",
      inputSchema: readInput,
    },
    async (args) => text(await readMemory(client, args)),
  );

  server.registerTool(
    "read_user_memory",
    {
      title: "Read user memory",
      description: "Semantic alias for reading a specific gotomemory memory by id.",
      inputSchema: readInput,
    },
    async (args) => text(await readMemory(client, args)),
  );

  server.registerTool(
    "save_memory",
    {
      title: "Save memory",
      description:
        "Save a durable user memory such as a preference, fact, note, or instruction. Do not use for raw secrets.",
      inputSchema: saveInput,
    },
    async (args) => text(await saveMemory(client, args)),
  );

  server.registerTool(
    "save_user_memory",
    {
      title: "Save user memory",
      description:
        "Semantic alias for remembering user-provided content in gotomemory after the user asks to save or remember it.",
      inputSchema: saveInput,
    },
    async (args) => text(await saveMemory(client, args)),
  );

  server.registerTool(
    "save_conversation_summary",
    {
      title: "Save conversation summary",
      description:
        "Save a concise summary of the current visible conversation to gotomemory. The assistant should summarize first, then pass the summary here.",
      inputSchema: {
        summary: z.string().describe("Concise durable summary of the visible conversation"),
        topic: z.string().optional().describe("Optional topic or label for the summary"),
        sensitivity: z
          .string()
          .optional()
          .describe("Optional sensitivity override if the user approved saving sensitive details"),
      },
    },
    async (args) => text(await saveConversationSummary(client, args)),
  );

  server.registerTool(
    "build_context",
    {
      title: "Build context",
      description:
        "Build governed memory context for a task. Private memories may require explicit confirmation.",
      inputSchema: buildInput,
    },
    async (args) => text(await buildContext(client, args)),
  );

  server.registerTool(
    "build_memory_context",
    {
      title: "Build memory context",
      description:
        "Semantic alias for using gotomemory to prepare relevant context for a ChatGPT, Claude, or Gemini task.",
      inputSchema: buildInput,
    },
    async (args) => text(await buildMemoryContext(client, args)),
  );

  server.registerTool(
    "confirm_context",
    {
      title: "Confirm context",
      description:
        "Redeem a one-time confirmation token after build_context asks the user to approve private memories.",
      inputSchema: confirmInput,
    },
    async (args) => text(await confirmContext(client, args)),
  );

  server.registerTool(
    "confirm_memory_context",
    {
      title: "Confirm memory context",
      description:
        "Semantic alias for approving selected private memories after a context build requires confirmation.",
      inputSchema: confirmInput,
    },
    async (args) => text(await confirmContext(client, args)),
  );

  server.registerTool(
    "share_generated_page",
    {
      title: "Share generated page",
      description:
        "Publish generated HTML, Markdown, PDF, Word, Excel, or PowerPoint as a read-only gotomemory Pages link.",
      inputSchema: pageInput,
    },
    async (args) => text(await shareGeneratedPage(client, args)),
  );

  server.registerTool(
    "share_html_page",
    {
      title: "Share HTML page",
      description: "Publish generated HTML as a sanitized, read-only shared page.",
      inputSchema: pageSpecificInput,
    },
    async (args) => text(await sharePageKind(client, "html", args)),
  );

  server.registerTool(
    "share_markdown_page",
    {
      title: "Share Markdown page",
      description: "Render Markdown to sanitized HTML and publish it as a read-only shared page.",
      inputSchema: pageSpecificInput,
    },
    async (args) => text(await sharePageKind(client, "markdown", args)),
  );

  server.registerTool(
    "share_pdf_page",
    {
      title: "Share PDF page",
      description: "Publish a PDF as a read-only shared artifact.",
      inputSchema: pageSpecificInput,
    },
    async (args) => text(await sharePageKind(client, "pdf", args)),
  );

  server.registerTool(
    "share_word_document",
    {
      title: "Share Word document",
      description: "Publish a .docx document as a read-only shared artifact.",
      inputSchema: pageSpecificInput,
    },
    async (args) => text(await sharePageKind(client, "docx", args)),
  );

  server.registerTool(
    "share_excel_workbook",
    {
      title: "Share Excel workbook",
      description: "Publish a .xlsx workbook as a read-only shared artifact.",
      inputSchema: pageSpecificInput,
    },
    async (args) => text(await sharePageKind(client, "xlsx", args)),
  );

  server.registerTool(
    "share_powerpoint_deck",
    {
      title: "Share PowerPoint deck",
      description: "Publish a .pptx deck as a read-only shared artifact.",
      inputSchema: pageSpecificInput,
    },
    async (args) => text(await sharePageKind(client, "pptx", args)),
  );

  server.registerTool(
    "list_shared_pages",
    {
      title: "List shared pages",
      description: "List read-only pages published by the current user.",
      inputSchema: { limit: z.number().int().positive().optional() },
    },
    async (args) => text(await listSharedPages(client, args)),
  );

  server.registerTool(
    "get_shared_page",
    {
      title: "Get shared page",
      description: "Get metadata for one shared page.",
      inputSchema: { id: z.string() },
    },
    async (args) => text(await getSharedPage(client, args)),
  );

  server.registerTool(
    "unpublish_shared_page",
    {
      title: "Unpublish shared page",
      description: "Unpublish a shared page so its URL is no longer accessible.",
      inputSchema: { id: z.string() },
    },
    async (args) => text(await unpublishSharedPage(client, args)),
  );

  server.registerTool(
    "update_shared_page_metadata",
    {
      title: "Update shared page metadata",
      description:
        "Update title, description, visibility, expiration, or status for a shared page.",
      inputSchema: {
        id: z.string(),
        version: z.number().int().positive(),
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        visibility: z.enum(["private", "unlisted", "public"]).optional(),
        expires_at: z.string().nullable().optional(),
        status: z.enum(["active", "unpublished", "expired", "deleted", "quarantined"]).optional(),
      },
    },
    async (args) => text(await updateSharedPageMetadata(client, args)),
  );
}

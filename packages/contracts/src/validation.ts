import type { ConversationMessage, MemoryCategory, SaveMemoryRequest } from "../generated/types.js";

const categories = new Set<MemoryCategory>(["preference", "fact", "project", "other"]);

export function validateSaveMemoryRequest(input: unknown): SaveMemoryRequest {
  if (!isRecord(input) || typeof input.content !== "string" || input.content.trim() === "") {
    throw new Error("content is required");
  }

  if (input.category !== undefined && !categories.has(input.category as MemoryCategory)) {
    throw new Error("category is invalid");
  }

  return {
    content: input.content.trim(),
    source:
      typeof input.source === "string" ? (input.source as SaveMemoryRequest["source"]) : undefined,
    category:
      typeof input.category === "string"
        ? (input.category as SaveMemoryRequest["category"])
        : undefined,
    is_private: typeof input.is_private === "boolean" ? input.is_private : undefined
  };
}

export function validateConversationMessages(input: unknown): ConversationMessage[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("messages must contain at least one message");
  }

  return input.map((message) => {
    if (
      !isRecord(message) ||
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string" ||
      message.content.trim() === ""
    ) {
      throw new Error("message is invalid");
    }

    return {
      role: message.role,
      content: message.content
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

import type {
  ConversationMessage,
  CreateShareRequest,
  MemoryCategory,
  SaveMemoryRequest,
  ShareVisibility
} from "../generated/types.js";

const categories = new Set<MemoryCategory>(["preference", "fact", "project", "other"]);
const visibilities = new Set<ShareVisibility>(["public", "password"]);

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

export function validateCreateShareRequest(input: unknown): CreateShareRequest {
  if (!isRecord(input)) {
    throw new Error("request body is required");
  }

  const messages = validateConversationMessages(input.messages);
  const visibility =
    typeof input.visibility === "string" ? (input.visibility as ShareVisibility) : "public";

  if (!visibilities.has(visibility)) {
    throw new Error("visibility is invalid");
  }

  if (visibility === "password" && typeof input.password !== "string") {
    throw new Error("password is required");
  }

  return {
    title: typeof input.title === "string" ? input.title.trim() : undefined,
    source_platform:
      typeof input.source_platform === "string"
        ? (input.source_platform as CreateShareRequest["source_platform"])
        : undefined,
    messages,
    visibility,
    password: typeof input.password === "string" ? input.password : undefined,
    expires_in_hours:
      typeof input.expires_in_hours === "number" ? input.expires_in_hours : undefined
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

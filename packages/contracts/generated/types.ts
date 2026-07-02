export type Platform = "chatgpt" | "claude" | "gemini";
export type MemorySource = Platform | "manual" | "import";
export type MemoryCategory = "preference" | "fact" | "project" | "other";
export type ConversationRole = "user" | "assistant";

export interface Memory {
  id: string;
  user_id: string;
  content: string;
  category: MemoryCategory;
  is_private: boolean;
  source: MemorySource;
  role?: ConversationRole | null;
  conversation_id?: string | null;
  conversation_title?: string | null;
  source_url?: string | null;
  embedding?: number[] | null;
  rev: number;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryPause {
  user_id: string;
  memory_id: string;
  platform: Platform;
}

export interface SaveMemoryRequest {
  content: string;
  source?: MemorySource;
  category?: MemoryCategory;
  is_private?: boolean;
  role?: ConversationRole | null;
  conversation_id?: string | null;
  conversation_title?: string | null;
  source_url?: string | null;
  /** Original generation time (ISO) to record as the memory's created_at. */
  created_at?: string | null;
}

export interface SearchMemoriesRequest {
  q?: string;
  limit?: number;
}

export interface ContextRequest {
  platform: Platform;
  topic: string;
  limit?: number;
  /** Exclude memories from this conversation, so a thread isn't re-injected into itself. */
  exclude_conversation_id?: string | null;
}

export interface ContextResponse {
  ready: Memory[];
  needs_confirm: Memory[];
}

export interface UpdateMemoryRequest {
  content?: string;
  category?: MemoryCategory;
  is_private?: boolean;
}

export interface PauseMemoryRequest {
  platform: Platform;
}

export interface ConversationMessage {
  role: ConversationRole;
  content: string;
  /** Original generation time of the message (ISO), when the platform exposes it. */
  timestamp?: string | null;
}

export interface SyncMemoryEnvelope {
  id: string;
  user_id: string;
  rev: number;
  ciphertext: string;
  iv: string;
  salt: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface SyncPushResponse {
  accepted: number;
}

export interface SyncPullResponse {
  envelopes: SyncMemoryEnvelope[];
}

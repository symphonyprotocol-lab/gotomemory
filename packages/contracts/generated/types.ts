export type Platform = "chatgpt" | "claude" | "gemini";
export type MemorySource = Platform | "manual" | "import";
export type MemoryCategory = "preference" | "fact" | "project" | "other";
export type ShareVisibility = "public" | "password";
export type ShareStatus = "active" | "expired" | "deleted";
export type ConversationRole = "user" | "assistant";

export interface Memory {
  id: string;
  user_id: string;
  content: string;
  category: MemoryCategory;
  is_private: boolean;
  source: MemorySource;
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
}

export interface SearchMemoriesRequest {
  q?: string;
  limit?: number;
}

export interface ContextRequest {
  platform: Platform;
  topic: string;
  limit?: number;
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
}

export interface SharedConversation {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  source_platform?: Platform;
  messages: ConversationMessage[];
  visibility: ShareVisibility;
  status: ShareStatus;
  expires_at?: string | null;
  view_count: number;
  created_at: string;
}

export interface CreateShareRequest {
  title?: string;
  source_platform?: Platform;
  messages: ConversationMessage[];
  visibility?: ShareVisibility;
  password?: string;
  expires_in_hours?: number;
}

export interface CreateShareResponse {
  id: string;
  url: string;
  visibility: ShareVisibility;
  status: ShareStatus;
  expires_at?: string | null;
}

export interface ShareListResponse {
  shares: SharedConversation[];
}

export interface UpdateShareRequest {
  title?: string;
  visibility?: ShareVisibility;
  password?: string | null;
  expires_at?: string | null;
  status?: ShareStatus;
}

export interface PublicShareLockedResponse {
  status: "password_required";
  title: string;
  visibility: "password";
}

export interface PublicShareResponse {
  status: "ok";
  share: SharedConversation;
}

export interface UnlockShareRequest {
  password: string;
}

export interface UnlockShareResponse {
  view_token: string;
  expires_at: string;
}

export interface ApiError {
  error: {
    code:
      | "bad_request"
      | "unauthorized"
      | "password_required"
      | "invalid_password"
      | "share_not_found"
      | "rate_limited";
    message: string;
  };
}

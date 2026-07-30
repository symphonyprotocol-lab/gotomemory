import type { Memory, MemoryPause, Platform } from "@gotomemory/contracts";

export interface MemoryStore {
  create(memory: Memory): Promise<Memory>;
  /**
   * Persist a batch in one storage transaction. Blob-backed stores rewrite
   * their entire state per create(), so a 300-message "save whole conversation"
   * must not become 300 full-blob rewrites.
   */
  createMany(memories: Memory[]): Promise<Memory[]>;
  list(userId: string): Promise<Memory[]>;
  /**
   * Memories belonging to any of `conversationIds`. Conversation-scoped dedup
   * runs on every single save; going through `list()` for it deep-clones the
   * entire library per message, which grows without bound under
   * `unlimitedStorage` + whole-conversation captures.
   */
  listByConversation(userId: string, conversationIds: string[]): Promise<Memory[]>;
  get(userId: string, id: string): Promise<Memory | undefined>;
  update(userId: string, id: string, patch: Partial<Memory>): Promise<Memory>;
  remove(userId: string, id: string): Promise<void>;
  /**
   * Delete a batch in one storage transaction. "Delete this conversation" is a
   * single user action over N memories; per-id removes would rewrite the whole
   * blob N times and leave a half-deleted group behind if one of them fails.
   */
  removeMany(userId: string, ids: string[]): Promise<void>;
  pause(userId: string, memoryId: string, platform: Platform): Promise<MemoryPause>;
  resume(userId: string, memoryId: string, platform: Platform): Promise<void>;
  listPauses(userId: string): Promise<MemoryPause[]>;
}

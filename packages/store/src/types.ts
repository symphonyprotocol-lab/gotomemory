import type { Memory, MemoryPause, Platform } from "@gotomemory/contracts";

export interface MemoryStore {
  create(memory: Memory): Promise<Memory>;
  list(userId: string): Promise<Memory[]>;
  get(userId: string, id: string): Promise<Memory | undefined>;
  update(userId: string, id: string, patch: Partial<Memory>): Promise<Memory>;
  remove(userId: string, id: string): Promise<void>;
  pause(userId: string, memoryId: string, platform: Platform): Promise<MemoryPause>;
  resume(userId: string, memoryId: string, platform: Platform): Promise<void>;
  listPauses(userId: string): Promise<MemoryPause[]>;
}

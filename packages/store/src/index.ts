import type { Memory, MemoryPause, Platform } from "@gotomemory/contracts";

export * from "./persistent.js";
export type { MemoryStore } from "./types.js";

import type { MemoryStore } from "./types.js";

export class InMemoryMemoryStore implements MemoryStore {
  readonly #memories = new Map<string, Memory>();
  readonly #pauses = new Map<string, MemoryPause>();

  async create(memory: Memory): Promise<Memory> {
    this.#memories.set(key(memory.user_id, memory.id), clone(memory));
    return clone(memory);
  }

  async list(userId: string): Promise<Memory[]> {
    return [...this.#memories.values()]
      .filter((memory) => memory.user_id === userId && !memory.deleted_at)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
      .map(clone);
  }

  async get(userId: string, id: string): Promise<Memory | undefined> {
    const memory = this.#memories.get(key(userId, id));
    return memory && !memory.deleted_at ? clone(memory) : undefined;
  }

  async update(userId: string, id: string, patch: Partial<Memory>): Promise<Memory> {
    const existing = this.#memories.get(key(userId, id));
    if (!existing || existing.deleted_at) {
      throw new Error(`memory not found: ${id}`);
    }

    const updated = {
      ...existing,
      ...patch,
      id,
      user_id: userId,
      rev: existing.rev + 1,
      updated_at: patch.updated_at ?? new Date().toISOString()
    };

    this.#memories.set(key(userId, id), updated);
    return clone(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    this.#memories.delete(key(userId, id));
    for (const pauseKey of this.#pauses.keys()) {
      if (pauseKey.startsWith(`${userId}:${id}:`)) {
        this.#pauses.delete(pauseKey);
      }
    }
  }

  async pause(userId: string, memoryId: string, platform: Platform): Promise<MemoryPause> {
    const pause = { user_id: userId, memory_id: memoryId, platform };
    this.#pauses.set(pauseKey(userId, memoryId, platform), pause);
    return { ...pause };
  }

  async resume(userId: string, memoryId: string, platform: Platform): Promise<void> {
    this.#pauses.delete(pauseKey(userId, memoryId, platform));
  }

  async listPauses(userId: string): Promise<MemoryPause[]> {
    return [...this.#pauses.values()]
      .filter((pause) => pause.user_id === userId)
      .map((pause) => ({ ...pause }));
  }
}

function key(userId: string, id: string) {
  return `${userId}:${id}`;
}

function pauseKey(userId: string, memoryId: string, platform: Platform) {
  return `${userId}:${memoryId}:${platform}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

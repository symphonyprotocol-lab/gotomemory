import type { Memory, MemoryPause, Platform } from "@gotomemory/contracts";

import type { MemoryStore } from "./types.js";

export interface JsonStorageDriver {
  read(): Promise<PersistedMemoryState | undefined>;
  write(state: PersistedMemoryState): Promise<void>;
}

export interface PersistedMemoryState {
  memories: Memory[];
  pauses: MemoryPause[];
}

export class PersistentJsonMemoryStore implements MemoryStore {
  readonly #driver: JsonStorageDriver;
  /**
   * Serializes every read-modify-write against the driver.
   *
   * Each mutation is `read blob → mutate → write blob`, so two overlapping
   * calls both read the same pre-state and the second write silently discards
   * the first one's memory. That is reachable in normal use: the MV3 background
   * handles each `runtime.sendMessage` independently, so two open assistant
   * tabs — or auto-capture racing a manual "save all" — drop saves while the
   * UI still reports success. Chaining through this queue makes every
   * transaction observe the previous one's committed state.
   */
  #queue: Promise<unknown> = Promise.resolve();

  constructor(driver: JsonStorageDriver) {
    this.#driver = driver;
  }

  async create(memory: Memory): Promise<Memory> {
    return (await this.createMany([memory]))[0]!;
  }

  /** One read + one write for the whole batch — create() per message would
   *  rewrite the full (growing) blob once per memory. */
  async createMany(memories: Memory[]): Promise<Memory[]> {
    if (memories.length === 0) {
      return [];
    }
    return this.#transaction(async (state) => {
      const incoming = memories.map(clone);
      state.memories = [
        ...state.memories.filter((item) => !incoming.some((memory) => sameMemory(item, memory))),
        ...incoming
      ];
      await this.#driver.write(state);
      return memories.map(clone);
    });
  }

  async list(userId: string): Promise<Memory[]> {
    return this.#transaction(async (state) =>
      state.memories
        .filter((memory) => memory.user_id === userId && !memory.deleted_at)
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
        .map(clone)
    );
  }

  async listByConversation(userId: string, conversationIds: string[]): Promise<Memory[]> {
    if (conversationIds.length === 0) {
      return [];
    }
    const wanted = new Set(conversationIds);
    return this.#transaction(async (state) =>
      state.memories
        .filter(
          (memory) =>
            memory.user_id === userId &&
            !memory.deleted_at &&
            memory.conversation_id != null &&
            wanted.has(memory.conversation_id)
        )
        .map(clone)
    );
  }

  async get(userId: string, id: string): Promise<Memory | undefined> {
    return this.#transaction(async (state) => {
      const memory = state.memories.find((item) => item.user_id === userId && item.id === id);
      return memory && !memory.deleted_at ? clone(memory) : undefined;
    });
  }

  async update(userId: string, id: string, patch: Partial<Memory>): Promise<Memory> {
    return this.#transaction(async (state) => {
      const index = state.memories.findIndex(
        (memory) => memory.user_id === userId && memory.id === id
      );
      const existing = state.memories[index];

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

      state.memories[index] = updated;
      await this.#driver.write(state);
      return clone(updated);
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    return this.#transaction(async (state) => {
      state.memories = state.memories.filter(
        (memory) => memory.user_id !== userId || memory.id !== id
      );
      state.pauses = state.pauses.filter(
        (pause) => pause.user_id !== userId || pause.memory_id !== id
      );
      await this.#driver.write(state);
    });
  }

  /** Delete a batch in one transaction — "delete this conversation" would
   *  otherwise rewrite the full blob once per memory. */
  async removeMany(userId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const doomed = new Set(ids);
    return this.#transaction(async (state) => {
      state.memories = state.memories.filter(
        (memory) => memory.user_id !== userId || !doomed.has(memory.id)
      );
      state.pauses = state.pauses.filter(
        (pause) => pause.user_id !== userId || !doomed.has(pause.memory_id)
      );
      await this.#driver.write(state);
    });
  }

  async pause(userId: string, memoryId: string, platform: Platform): Promise<MemoryPause> {
    return this.#transaction(async (state) => {
      const pause = { user_id: userId, memory_id: memoryId, platform };
      state.pauses = [
        ...state.pauses.filter(
          (item) =>
            item.user_id !== userId || item.memory_id !== memoryId || item.platform !== platform
        ),
        pause
      ];
      await this.#driver.write(state);
      return { ...pause };
    });
  }

  async resume(userId: string, memoryId: string, platform: Platform): Promise<void> {
    return this.#transaction(async (state) => {
      state.pauses = state.pauses.filter(
        (pause) =>
          pause.user_id !== userId || pause.memory_id !== memoryId || pause.platform !== platform
      );
      await this.#driver.write(state);
    });
  }

  async listPauses(userId: string): Promise<MemoryPause[]> {
    return this.#transaction(async (state) =>
      state.pauses.filter((pause) => pause.user_id === userId).map((pause) => ({ ...pause }))
    );
  }

  /**
   * Run `body` against a freshly-read state with no other transaction
   * interleaved. Reads are queued too: a read that observed a stale blob would
   * hand callers (e.g. the dedup index in `saveMany`) a pre-write snapshot.
   */
  #transaction<T>(body: (state: PersistedMemoryState) => Promise<T>): Promise<T> {
    const run = this.#queue.then(async () => body(await this.#state()));
    // Keep the chain alive after a rejected transaction; the caller still sees
    // the rejection through `run`.
    this.#queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async #state(): Promise<PersistedMemoryState> {
    const state = await this.#driver.read();
    return {
      memories: state?.memories ?? [],
      pauses: state?.pauses ?? []
    };
  }
}

export class MemoryJsonStorageDriver implements JsonStorageDriver {
  state: PersistedMemoryState | undefined;

  async read(): Promise<PersistedMemoryState | undefined> {
    return this.state ? clone(this.state) : undefined;
  }

  async write(state: PersistedMemoryState): Promise<void> {
    this.state = clone(state);
  }
}

/**
 * Shared by the platform storage drivers in ./extension to validate raw blobs.
 *
 * `value === undefined` means "nothing written yet" (a fresh install) and is
 * silently normalized to an empty state. Any other shape that fails to parse
 * means something was written but doesn't look like this store's blob
 * (corruption, a future incompatible schema change) — that case still falls
 * back to an empty state (never throw out of a storage read), but it is not
 * the same situation as a fresh install and must not be silently
 * indistinguishable from one, so it is logged.
 */
export function normalizeState(value: unknown): PersistedMemoryState | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value) || !Array.isArray(value.memories) || !Array.isArray(value.pauses)) {
    console.warn(
      "gotomemory: stored memory state is present but malformed; resetting to empty. " +
        "This may indicate storage corruption rather than a fresh install."
    );
    return undefined;
  }

  return {
    memories: value.memories as Memory[],
    pauses: value.pauses as MemoryPause[]
  };
}

function sameMemory(left: Memory, right: Memory): boolean {
  return left.user_id === right.user_id && left.id === right.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

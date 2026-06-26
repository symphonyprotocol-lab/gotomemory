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

  constructor(driver: JsonStorageDriver) {
    this.#driver = driver;
  }

  async create(memory: Memory): Promise<Memory> {
    const state = await this.#state();
    state.memories = [...state.memories.filter((item) => !sameMemory(item, memory)), clone(memory)];
    await this.#driver.write(state);
    return clone(memory);
  }

  async list(userId: string): Promise<Memory[]> {
    const state = await this.#state();
    return state.memories
      .filter((memory) => memory.user_id === userId && !memory.deleted_at)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
      .map(clone);
  }

  async get(userId: string, id: string): Promise<Memory | undefined> {
    const state = await this.#state();
    const memory = state.memories.find((item) => item.user_id === userId && item.id === id);
    return memory && !memory.deleted_at ? clone(memory) : undefined;
  }

  async update(userId: string, id: string, patch: Partial<Memory>): Promise<Memory> {
    const state = await this.#state();
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
  }

  async remove(userId: string, id: string): Promise<void> {
    const state = await this.#state();
    state.memories = state.memories.filter(
      (memory) => memory.user_id !== userId || memory.id !== id
    );
    state.pauses = state.pauses.filter(
      (pause) => pause.user_id !== userId || pause.memory_id !== id
    );
    await this.#driver.write(state);
  }

  async pause(userId: string, memoryId: string, platform: Platform): Promise<MemoryPause> {
    const state = await this.#state();
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
  }

  async resume(userId: string, memoryId: string, platform: Platform): Promise<void> {
    const state = await this.#state();
    state.pauses = state.pauses.filter(
      (pause) =>
        pause.user_id !== userId || pause.memory_id !== memoryId || pause.platform !== platform
    );
    await this.#driver.write(state);
  }

  async listPauses(userId: string): Promise<MemoryPause[]> {
    const state = await this.#state();
    return state.pauses.filter((pause) => pause.user_id === userId).map((pause) => ({ ...pause }));
  }

  async #state(): Promise<PersistedMemoryState> {
    const state = await this.#driver.read();
    return {
      memories: state?.memories ?? [],
      pauses: state?.pauses ?? []
    };
  }
}

export interface ChromeStorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export class ChromeStorageDriver implements JsonStorageDriver {
  readonly #area: ChromeStorageArea;
  readonly #key: string;

  constructor(area: ChromeStorageArea, key = "gotomemory.memoryStore") {
    this.#area = area;
    this.#key = key;
  }

  async read(): Promise<PersistedMemoryState | undefined> {
    const result = await this.#area.get(this.#key);
    return normalizeState(result[this.#key]);
  }

  async write(state: PersistedMemoryState): Promise<void> {
    await this.#area.set({ [this.#key]: state });
  }
}

export interface IndexedDbDriverOptions {
  dbName?: string;
  storeName?: string;
  key?: string;
  indexedDB?: IDBFactory;
}

export class IndexedDbDriver implements JsonStorageDriver {
  readonly #dbName: string;
  readonly #storeName: string;
  readonly #key: string;
  readonly #indexedDB: IDBFactory;

  constructor(options: IndexedDbDriverOptions = {}) {
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) {
      throw new Error("IndexedDB is not available");
    }

    this.#dbName = options.dbName ?? "gotomemory";
    this.#storeName = options.storeName ?? "json";
    this.#key = options.key ?? "memoryStore";
    this.#indexedDB = factory;
  }

  async read(): Promise<PersistedMemoryState | undefined> {
    const db = await this.#open();
    try {
      const value = await requestToPromise(
        db.transaction(this.#storeName, "readonly").objectStore(this.#storeName).get(this.#key)
      );
      return normalizeState(value);
    } finally {
      db.close();
    }
  }

  async write(state: PersistedMemoryState): Promise<void> {
    const db = await this.#open();
    try {
      await requestToPromise(
        db
          .transaction(this.#storeName, "readwrite")
          .objectStore(this.#storeName)
          .put(state, this.#key)
      );
    } finally {
      db.close();
    }
  }

  #open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.#indexedDB.open(this.#dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.#storeName)) {
          db.createObjectStore(this.#storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("failed to open IndexedDB"));
    });
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

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function normalizeState(value: unknown): PersistedMemoryState | undefined {
  if (!isRecord(value) || !Array.isArray(value.memories) || !Array.isArray(value.pauses)) {
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

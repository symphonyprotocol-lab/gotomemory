import {
  normalizeState,
  type JsonStorageDriver,
  type PersistedMemoryState
} from "../persistent.js";

/**
 * Platform-touching storage drivers (spec §5): isolated here so the rest of
 * `store` stays platform-agnostic and testable in plain Node. Both drivers take
 * their platform handle by injection (a `chrome.storage`-shaped area or an
 * `IDBFactory`) rather than reaching for `chrome`/`indexedDB` globals.
 */

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

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

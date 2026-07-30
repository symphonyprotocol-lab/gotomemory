import type { ChromeStorageArea } from "@gotomemory/store";

/**
 * Tiny key-value persistence for extension state that isn't a memory:
 * settings, local metrics, verified selector overrides. Backed by
 * chrome.storage.local in the extension, by a Map in tests.
 */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  /**
   * Atomic read-modify-write for one key. Settings and metrics are both
   * "read current, merge, write back"; interleaving two of those (two tabs
   * flipping switches, a metric landing mid-settings-save) drops one update.
   * Implementations must run `mutate` with no other update to the same store
   * interleaved, and return the value written.
   */
  update<T>(key: string, mutate: (current: unknown) => T | Promise<T>): Promise<T>;
}

/** Shared serialization for the key-value drivers below. */
abstract class QueuedKeyValueStore implements KeyValueStore {
  #queue: Promise<unknown> = Promise.resolve();

  abstract get(key: string): Promise<unknown>;
  abstract set(key: string, value: unknown): Promise<void>;

  async update<T>(key: string, mutate: (current: unknown) => T | Promise<T>): Promise<T> {
    const run = this.#queue.then(async () => {
      const next = await mutate(await this.get(key));
      await this.set(key, next);
      return next;
    });
    // Keep the chain alive after a rejection; the caller still sees it via `run`.
    this.#queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

export class InMemoryKeyValueStore extends QueuedKeyValueStore {
  readonly #items = new Map<string, unknown>();

  async get(key: string): Promise<unknown> {
    return this.#items.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.#items.set(key, structuredClone(value));
  }
}

export class ChromeKeyValueStore extends QueuedKeyValueStore {
  readonly #area: ChromeStorageArea;

  constructor(area: ChromeStorageArea) {
    super();
    this.#area = area;
  }

  async get(key: string): Promise<unknown> {
    return (await this.#area.get(key))[key];
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.#area.set({ [key]: value });
  }
}

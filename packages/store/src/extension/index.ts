import {
  normalizeState,
  type JsonStorageDriver,
  type PersistedMemoryState
} from "../persistent.js";

/**
 * Platform-touching storage drivers (spec §5): isolated here so the rest of
 * `store` stays platform-agnostic and testable in plain Node. The driver takes
 * its platform handle by injection (a `chrome.storage`-shaped area) rather than
 * reaching for the `chrome` global.
 *
 * An IndexedDB driver used to sit alongside this one, unused: the extension
 * commits to `chrome.storage.local` + the `unlimitedStorage` permission, which
 * is what survives service-worker eviction and is what the background actually
 * constructs. Reintroduce it only if a real second backend is needed.
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

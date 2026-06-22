/**
 * Persisted extension settings (gateway connection). Stored in extension storage so the
 * popup is not hard-wired to one gateway. The storage area is injected so this module is
 * unit-testable without a browser.
 */
export interface Settings {
  /** Gateway base URL including the API version, e.g. http://localhost:8787/v1 */
  baseUrl: string;
  /** Bearer token (dev form is `tenant:subject`, e.g. t1:u1). */
  token: string;
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: "http://localhost:8787/v1",
  token: "t1:u1",
};

/** Minimal structural view of `browser.storage.local` (get/set return promises). */
export interface StorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const KEY = "settings";

/** Load settings, falling back to defaults for any missing field. */
export async function loadSettings(area: StorageArea): Promise<Settings> {
  const raw = await area.get(KEY);
  const stored = (raw[KEY] ?? {}) as Partial<Settings>;
  return {
    baseUrl: stored.baseUrl?.trim() || DEFAULT_SETTINGS.baseUrl,
    token: stored.token?.trim() || DEFAULT_SETTINGS.token,
  };
}

export async function saveSettings(area: StorageArea, settings: Settings): Promise<void> {
  await area.set({ [KEY]: settings });
}

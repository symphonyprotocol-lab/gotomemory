import {
  verifySignedSelectorOverrides,
  type SelectorOverrides,
  type SignedSelectorOverrides
} from "@gotomemory/site-adapters";

import type { KeyValueStore } from "./kv.js";

/**
 * Remote selector override channel (monorepo spec §7): the background fetches a
 * signed, selector-strings-only JSON so platform redesigns can be hot-fixed
 * without waiting out a store review. Everything fails open to the built-in
 * selectors. The endpoint must serve CORS headers (MV3 background fetch), which
 * keeps the manifest's host permissions untouched.
 */
/**
 * Must stay on a domain we actually own. This previously pointed at
 * `config.gotomemory.app`, which nobody registered: every install would have
 * been sending requests — and therefore its IP — to whoever claimed that name
 * later, while the privacy policy described the endpoint as ours.
 */
export const SELECTOR_OVERRIDES_URL = "https://config.gotomemory.dev/selector-overrides.v1.json";

/**
 * Production verification key for the override channel. Public half only — it
 * ships inside every installed extension, which is the point: the private half
 * stays offline (`tooling/selector-signing/selector-signing-key.json`, which is
 * git-ignored) and is the only thing that can mint a document this accepts.
 *
 * Rotating it is a store release, not a config push: extensions verify against
 * the key compiled into them, so a new key only takes effect once users update.
 * Publish documents signed with the *old* key until that rollout completes.
 */
export const SELECTOR_OVERRIDES_PUBLIC_KEY: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "UH0SvIfedht4OIIgxyH9UBGzotX0UjAWuMTEAgyJt-A",
  y: "cmfBMRAq9XUvg2B7Mbj606NLlmTBBWJp6VOf4MZL3_I"
};

export const SELECTOR_OVERRIDES_KEY = "gotomemory:selector-overrides";
/** Highest config version accepted so far — the replay floor. */
export const SELECTOR_VERSION_KEY = "gotomemory:selector-overrides-version";
/** When the last fetch attempt happened, so worker churn can't become a hammer. */
export const SELECTOR_FETCHED_AT_KEY = "gotomemory:selector-overrides-fetched-at";

/**
 * Minimum gap between config fetches. MV3 evicts and restarts the service
 * worker constantly, and the refresh runs on every start — without this, a busy
 * session hits the config endpoint dozens of times an hour for a document that
 * changes maybe monthly.
 */
export const SELECTOR_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface SelectorRefreshDeps {
  kv: KeyValueStore;
  fetchFn?: typeof fetch;
  url?: string;
  publicKey?: JsonWebKey;
  now?: () => number;
  /** Skip the fetch-interval check (manual "check for updates"). */
  force?: boolean;
}

/**
 * Fetch, verify, and persist the current overrides. Any failure (network, bad
 * signature, malformed JSON, a rolled-back version) leaves the previously
 * stored overrides untouched and returns undefined.
 */
export async function refreshSelectorOverrides(
  deps: SelectorRefreshDeps
): Promise<SelectorOverrides | undefined> {
  try {
    const now = deps.now ?? (() => Date.now());
    const stamp = await deps.kv.get(SELECTOR_FETCHED_AT_KEY);
    // A missing stamp means "never fetched" — a fresh install must fetch
    // immediately rather than wait out a full interval.
    const lastFetchedAt = typeof stamp === "number" && Number.isFinite(stamp) ? stamp : null;
    if (
      !deps.force &&
      lastFetchedAt !== null &&
      now() - lastFetchedAt < SELECTOR_REFRESH_INTERVAL_MS
    ) {
      return undefined;
    }
    // Stamp before the request so a hanging or failing fetch still backs off.
    await deps.kv.set(SELECTOR_FETCHED_AT_KEY, now());

    const fetchFn = deps.fetchFn ?? fetch;
    const response = await fetchFn(deps.url ?? SELECTOR_OVERRIDES_URL);
    if (!response.ok) {
      return undefined;
    }
    const signed = (await response.json()) as SignedSelectorOverrides;
    const verified = await verifySignedSelectorOverrides(
      signed,
      deps.publicKey ?? SELECTOR_OVERRIDES_PUBLIC_KEY
    );
    if (!verified) {
      return undefined;
    }

    // Replay guard: a correctly-signed but older document must not reinstate
    // selectors we have already moved past.
    const acceptedVersion = Number(await deps.kv.get(SELECTOR_VERSION_KEY)) || 0;
    if (verified.version < acceptedVersion) {
      return undefined;
    }

    await deps.kv.set(SELECTOR_OVERRIDES_KEY, verified.overrides);
    await deps.kv.set(SELECTOR_VERSION_KEY, verified.version);
    return verified.overrides;
  } catch {
    return undefined;
  }
}

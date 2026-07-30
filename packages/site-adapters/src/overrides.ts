import type { Platform } from "@gotomemory/contracts";

/**
 * Remote selector overrides (monorepo spec §7 选择器远程配置).
 *
 * When a platform ships a redesign, the built-in selectors break and a store
 * review cycle (days) is too slow a fix. The background fetches a signed JSON
 * document containing ONLY selector strings, verifies its signature, and the
 * content scripts apply it over the built-in defaults. The hard line: this
 * channel carries CSS selector strings, never code.
 */

const OVERRIDABLE_PLATFORMS = ["chatgpt", "claude", "gemini"] as const;

export const OVERRIDABLE_SELECTOR_KEYS = [
  "messageSelector",
  "inputSelector",
  "mountSelector"
] as const;

export type OverridableSelectorKey = (typeof OVERRIDABLE_SELECTOR_KEYS)[number];

export type SelectorOverrides = Partial<
  Record<Platform, Partial<Record<OverridableSelectorKey, string>>>
>;

/** Wire format: the JSON payload string plus a base64 ECDSA P-256/SHA-256 signature over it. */
export interface SignedSelectorOverrides {
  payload: string;
  signature: string;
}

/**
 * A verified document plus the version it declared. Signatures alone don't stop
 * replay: anyone who can answer the config request (a hostile network, a stale
 * CDN edge) can serve a correctly-signed *older* document and roll selectors
 * back to a broken set. Callers keep the highest version they have accepted.
 */
export interface VerifiedSelectorOverrides {
  version: number;
  overrides: SelectorOverrides;
}

/** Payload shape: `version` is signed along with the selectors. */
interface SelectorOverridePayload {
  version?: unknown;
  selectors?: unknown;
}

// A selector this long is not a selector; cap it so a compromised config can't
// smuggle arbitrary bulk data into storage.
const MAX_SELECTOR_LENGTH = 1000;

/**
 * Strict allowlist validation: unknown platforms and keys are dropped, values
 * must be non-empty strings. Anything else in the document is ignored, so a
 * signed-but-overreaching config can still only ever change three selector
 * strings per site.
 */
export function sanitizeSelectorOverrides(value: unknown): SelectorOverrides {
  const result: SelectorOverrides = {};
  if (typeof value !== "object" || value === null) {
    return result;
  }

  for (const platform of OVERRIDABLE_PLATFORMS) {
    const entry = (value as Record<string, unknown>)[platform];
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const fields: Partial<Record<OverridableSelectorKey, string>> = {};
    for (const key of OVERRIDABLE_SELECTOR_KEYS) {
      const selector = (entry as Record<string, unknown>)[key];
      if (
        typeof selector === "string" &&
        selector.trim().length > 0 &&
        selector.length <= MAX_SELECTOR_LENGTH
      ) {
        fields[key] = selector;
      }
    }
    if (Object.keys(fields).length > 0) {
      result[platform] = fields;
    }
  }
  return result;
}

/**
 * Verify the config signature and return the sanitized overrides, or undefined
 * when anything is off (bad key, bad signature, malformed JSON). Callers fail
 * open to the built-in selectors.
 */
export async function verifySignedSelectorOverrides(
  signed: SignedSelectorOverrides,
  publicKeyJwk: JsonWebKey,
  subtle: SubtleCrypto = globalThis.crypto.subtle
): Promise<VerifiedSelectorOverrides | undefined> {
  try {
    if (typeof signed?.payload !== "string" || typeof signed?.signature !== "string") {
      return undefined;
    }
    const key = await subtle.importKey(
      "jwk",
      publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    const valid = await subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64ToBytes(signed.signature),
      new TextEncoder().encode(signed.payload)
    );
    if (!valid) {
      return undefined;
    }

    const parsed = JSON.parse(signed.payload) as SelectorOverridePayload;
    // Versioned envelope `{version, selectors}`; a bare selector map is treated
    // as version 0 so an unversioned document can only ever be replaced, never
    // reinstated over a versioned one.
    const versioned = typeof parsed?.version === "number" && Number.isFinite(parsed.version);
    return {
      version: versioned ? (parsed.version as number) : 0,
      overrides: sanitizeSelectorOverrides(versioned ? parsed.selectors : parsed)
    };
  } catch {
    return undefined;
  }
}

/** Overlay verified overrides onto the live adapter registry. */
// Structural parameter type (not the SiteAdapter interface) keeps this module
// import-cycle-free with index.ts, which re-exports it.
export function applySelectorOverrides(
  adapters: Record<Platform, Record<OverridableSelectorKey, string>>,
  overrides: SelectorOverrides
): void {
  const sanitized = sanitizeSelectorOverrides(overrides);
  for (const platform of OVERRIDABLE_PLATFORMS) {
    const fields = sanitized[platform];
    if (!fields) {
      continue;
    }
    for (const key of OVERRIDABLE_SELECTOR_KEYS) {
      const selector = fields[key];
      if (selector) {
        adapters[platform][key] = selector;
      }
    }
  }
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

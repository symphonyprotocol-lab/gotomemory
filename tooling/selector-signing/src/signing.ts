/**
 * Ops side of the remote selector-override channel (monorepo spec §7).
 *
 * The extension verifies configs with WebCrypto `SubtleCrypto.verify`, which
 * expects the RAW r‖s ECDSA signature encoding. Signing with openssl produces
 * DER and fails verification silently — so signing must go through these
 * WebCrypto helpers (or the `keygen`/`sign` CLIs wrapping them), keeping both
 * ends of the channel byte-compatible by construction.
 */

import {
  sanitizeSelectorOverrides,
  type SelectorOverrides,
  type SignedSelectorOverrides
} from "@gotomemory/site-adapters";

export interface SigningKeyPair {
  /** Keep offline; never committed, never shipped. */
  privateKeyJwk: JsonWebKey;
  /** Pasted into apps/extension/src/selector-config.ts at release. */
  publicKeyJwk: JsonWebKey;
}

export async function generateSigningKeyPair(
  subtle: SubtleCrypto = globalThis.crypto.subtle
): Promise<SigningKeyPair> {
  const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify"
  ]);
  return {
    privateKeyJwk: await subtle.exportKey("jwk", pair.privateKey),
    publicKeyJwk: await subtle.exportKey("jwk", pair.publicKey)
  };
}

/**
 * Sanitize (same allowlist the extension applies) and sign the overrides.
 * Signing an empty/over-reaching document is refused outright: a config that
 * the extension would ignore anyway must fail loudly at ops time instead.
 */
export async function signSelectorOverrides(
  overrides: SelectorOverrides,
  privateKeyJwk: JsonWebKey,
  version: number,
  subtle: SubtleCrypto = globalThis.crypto.subtle
): Promise<SignedSelectorOverrides> {
  const sanitized = sanitizeSelectorOverrides(overrides);
  if (Object.keys(sanitized).length === 0) {
    throw new Error(
      "no valid selector overrides to sign — allowed: chatgpt/claude/gemini × " +
        "messageSelector/inputSelector/mountSelector, non-empty strings ≤1000 chars"
    );
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(
      "version must be a positive integer — extensions reject non-increasing configs"
    );
  }

  // The version is inside the signed payload: the extension refuses any config
  // older than the highest it has already accepted, so a signed-but-stale
  // document cannot be replayed to roll selectors back.
  const payload = JSON.stringify({ version, selectors: sanitized });
  const key = await subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(payload)
  );
  return { payload, signature: Buffer.from(signature).toString("base64") };
}

/** The exact constant to paste into apps/extension/src/selector-config.ts. */
export function publicKeySnippet(publicKeyJwk: JsonWebKey): string {
  return [
    "export const SELECTOR_OVERRIDES_PUBLIC_KEY: JsonWebKey = {",
    `  kty: ${JSON.stringify(publicKeyJwk.kty ?? "EC")},`,
    `  crv: ${JSON.stringify(publicKeyJwk.crv ?? "P-256")},`,
    `  x: ${JSON.stringify(publicKeyJwk.x ?? "")},`,
    `  y: ${JSON.stringify(publicKeyJwk.y ?? "")}`,
    "};"
  ].join("\n");
}

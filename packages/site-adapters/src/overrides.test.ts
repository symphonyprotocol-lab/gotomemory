import { describe, expect, it } from "vitest";

import {
  sanitizeSelectorOverrides,
  verifySignedSelectorOverrides,
  type SelectorOverrides
} from "./overrides.js";

async function makeSigned(overrides: unknown) {
  const subtle = globalThis.crypto.subtle;
  const keyPair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify"
  ]);
  const payload = JSON.stringify(overrides);
  const signature = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    new TextEncoder().encode(payload)
  );
  return {
    signed: { payload, signature: Buffer.from(signature).toString("base64") },
    publicKeyJwk: await subtle.exportKey("jwk", keyPair.publicKey)
  };
}

describe("selector overrides", () => {
  it("keeps only known platforms, known selector keys, and string values", () => {
    const sanitized = sanitizeSelectorOverrides({
      chatgpt: {
        messageSelector: "[data-x]",
        inputSelector: 42,
        code: "alert(1)",
        mountSelector: ""
      },
      claude: { inputSelector: "textarea.new" },
      "evil-site": { messageSelector: "*" },
      permissions: ["<all_urls>"]
    });

    expect(sanitized).toEqual({
      chatgpt: { messageSelector: "[data-x]" },
      claude: { inputSelector: "textarea.new" }
    });
  });

  it("accepts a correctly signed config and returns the sanitized overrides", async () => {
    const overrides: SelectorOverrides = { gemini: { messageSelector: "chat-turn" } };
    const { signed, publicKeyJwk } = await makeSigned(overrides);

    // Unversioned documents verify as version 0, so a versioned config always wins.
    await expect(verifySignedSelectorOverrides(signed, publicKeyJwk)).resolves.toEqual({
      version: 0,
      overrides
    });
  });

  it("carries the signed version so callers can refuse a replayed older config", async () => {
    const { signed, publicKeyJwk } = await makeSigned({
      version: 4,
      selectors: { gemini: { messageSelector: "chat-turn" } }
    });

    await expect(verifySignedSelectorOverrides(signed, publicKeyJwk)).resolves.toEqual({
      version: 4,
      overrides: { gemini: { messageSelector: "chat-turn" } }
    });
  });

  it("rejects a tampered payload", async () => {
    const { signed, publicKeyJwk } = await makeSigned({ gemini: { messageSelector: "chat-turn" } });
    const tampered = {
      ...signed,
      payload: JSON.stringify({ gemini: { messageSelector: "injected" } })
    };

    await expect(verifySignedSelectorOverrides(tampered, publicKeyJwk)).resolves.toBeUndefined();
  });

  it("rejects a signature from a different key", async () => {
    const { signed } = await makeSigned({ chatgpt: { inputSelector: "textarea" } });
    const { publicKeyJwk: otherKey } = await makeSigned({});

    await expect(verifySignedSelectorOverrides(signed, otherKey)).resolves.toBeUndefined();
  });

  it("fails closed (undefined) on malformed input instead of throwing", async () => {
    const { publicKeyJwk } = await makeSigned({});

    await expect(
      verifySignedSelectorOverrides({ payload: "{", signature: "!!!" }, publicKeyJwk)
    ).resolves.toBeUndefined();
    await expect(
      verifySignedSelectorOverrides({ payload: "{}", signature: "AAAA" }, { kty: "oct" })
    ).resolves.toBeUndefined();
  });
});

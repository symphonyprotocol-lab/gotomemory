import { verifySignedSelectorOverrides } from "@gotomemory/site-adapters";
import { describe, expect, it } from "vitest";

import { generateSigningKeyPair, publicKeySnippet, signSelectorOverrides } from "./signing.js";

describe("selector-override signing", () => {
  it("round-trips: what the ops CLI signs, the extension verifies", async () => {
    const pair = await generateSigningKeyPair();
    const signed = await signSelectorOverrides(
      { chatgpt: { messageSelector: "[data-new-turn]" } },
      pair.privateKeyJwk,
      7
    );

    // The exact verification path the extension background runs.
    const verified = await verifySignedSelectorOverrides(signed, pair.publicKeyJwk);
    expect(verified).toEqual({
      version: 7,
      overrides: { chatgpt: { messageSelector: "[data-new-turn]" } }
    });
  });

  it("rejects tampered payloads and wrong keys end to end", async () => {
    const pair = await generateSigningKeyPair();
    const other = await generateSigningKeyPair();
    const signed = await signSelectorOverrides(
      { gemini: { inputSelector: "rich-textarea" } },
      pair.privateKeyJwk,
      1
    );

    const tampered = { ...signed, payload: signed.payload.replace("rich", "evil") };
    expect(await verifySignedSelectorOverrides(tampered, pair.publicKeyJwk)).toBeUndefined();
    expect(await verifySignedSelectorOverrides(signed, other.publicKeyJwk)).toBeUndefined();
  });

  it("refuses to sign a document the extension would ignore anyway", async () => {
    const pair = await generateSigningKeyPair();
    await expect(
      signSelectorOverrides({ notaplatform: { foo: "bar" } } as never, pair.privateKeyJwk, 1)
    ).rejects.toThrow(/no valid selector overrides/);
  });

  it("refuses to sign without an increasing version", async () => {
    const pair = await generateSigningKeyPair();
    await expect(
      signSelectorOverrides({ chatgpt: { mountSelector: "main" } }, pair.privateKeyJwk, 0)
    ).rejects.toThrow(/version must be a positive integer/);
  });

  it("prints a paste-ready public-key constant", async () => {
    const pair = await generateSigningKeyPair();
    const snippet = publicKeySnippet(pair.publicKeyJwk);
    expect(snippet).toContain("SELECTOR_OVERRIDES_PUBLIC_KEY");
    expect(snippet).toContain(`x: ${JSON.stringify(pair.publicKeyJwk.x)}`);
    expect(snippet).not.toContain("PLACEHOLDER");
  });
});

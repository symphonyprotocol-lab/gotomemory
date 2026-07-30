import { describe, expect, it } from "vitest";

import { SELECTOR_OVERRIDES_PUBLIC_KEY, SELECTOR_OVERRIDES_URL } from "./selector-config.js";

/** The only domain this project owns. */
const OWNED_DOMAIN = "gotomemory.dev";

describe("selector override endpoint", () => {
  /**
   * This URL is the one thing every install reaches out to, so it hands the
   * host an IP address from every user. It shipped pointing at
   * `config.gotomemory.app`, a domain nobody had registered — anyone could have
   * claimed it and started collecting those requests, while the privacy policy
   * described the endpoint as ours. Keep it on a domain we control.
   */
  it("only ever calls a domain the project owns, over https", () => {
    const url = new URL(SELECTOR_OVERRIDES_URL);

    expect(url.protocol).toBe("https:");
    expect(url.hostname === OWNED_DOMAIN || url.hostname.endsWith(`.${OWNED_DOMAIN}`)).toBe(true);
  });

  /**
   * A placeholder key fails every signature, which the channel treats as "keep
   * the built-in selectors" — so it shipped for a while looking fine while
   * being incapable of ever delivering a hot-fix. Failing open is right at
   * runtime, but it means a broken key is silent, so it gets asserted here.
   *
   * Only the shape can be checked in CI: proving the key matches the private
   * half needs that private half, which is deliberately offline.
   */
  it("ships a real P-256 verification key, not a placeholder", () => {
    const { kty, crv, x, y, d } = SELECTOR_OVERRIDES_PUBLIC_KEY;

    expect(kty).toBe("EC");
    expect(crv).toBe("P-256");
    // The public half only — a private component here would leak the ability to
    // sign to every installed extension.
    expect(d).toBeUndefined();

    for (const coordinate of [x, y]) {
      expect(coordinate).toMatch(/^[A-Za-z0-9_-]+$/);
      // 32 bytes of base64url, unpadded.
      expect(coordinate).toHaveLength(43);
    }
  });
});

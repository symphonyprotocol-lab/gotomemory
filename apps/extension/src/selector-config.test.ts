import { describe, expect, it } from "vitest";

import { SELECTOR_OVERRIDES_URL } from "./selector-config.js";

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
});

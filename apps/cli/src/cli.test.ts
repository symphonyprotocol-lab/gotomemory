import { describe, expect, it } from "vitest";
import { exitCodeFor } from "./exit-codes.js";

describe("exitCodeFor", () => {
  it("maps each error code to its stable exit code", () => {
    expect(exitCodeFor("invalid_request")).toBe(2);
    expect(exitCodeFor("unauthenticated")).toBe(3);
    expect(exitCodeFor("policy_denied")).toBe(4);
    expect(exitCodeFor("not_found")).toBe(5);
    expect(exitCodeFor("version_conflict")).toBe(6);
    expect(exitCodeFor("rate_limited")).toBe(7);
  });

  it("falls back to 1 for unknown codes", () => {
    expect(exitCodeFor("internal")).toBe(1);
    expect(exitCodeFor("something-else")).toBe(1);
  });
});

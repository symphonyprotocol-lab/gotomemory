import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import type { Action, Policy, Sensitivity } from "./types.js";

const NOW = 1_700_000_000_000;

function policy(over: Partial<Policy>): Policy {
  return {
    id: "p",
    tenantId: "t1",
    subjectId: "u1",
    subjectType: "user",
    effect: "allow",
    action: "inject",
    platform: null,
    clientId: null,
    scope: null,
    purpose: null,
    memoryType: null,
    tag: null,
    maxSensitivity: "private",
    injectionMode: "auto",
    precedence: 100,
    ...over,
  };
}

function input(over: Partial<Parameters<typeof evaluate>[1]> = {}) {
  return {
    tenantId: "t1",
    subjectId: "u1",
    action: "inject" as Action,
    memory: { type: "preference", tags: [] as string[], sensitivity: "normal" as Sensitivity },
    now: NOW,
    ...over,
  };
}

describe("policy evaluate", () => {
  it("default-denies when nothing matches", () => {
    expect(evaluate([], input()).effect).toBe("deny");
    expect(evaluate([], input()).reason).toBe("default_deny");
  });

  it("allows a matching policy", () => {
    const d = evaluate([policy({ id: "a" })], input());
    expect(d.effect).toBe("allow");
    expect(d.matchedPolicyIds).toEqual(["a"]);
  });

  it("a higher-priority (lower precedence) allow beats a lower-priority deny", () => {
    const allow = policy({ id: "allow", effect: "allow", precedence: 10 });
    const denyLow = policy({ id: "deny", effect: "deny", precedence: 100 });
    expect(evaluate([denyLow, allow], input()).effect).toBe("allow");
  });

  it("deny overrides allow within the same precedence band", () => {
    const allow = policy({ id: "allow", effect: "allow", precedence: 10 });
    const denySame = policy({ id: "deny", effect: "deny", precedence: 10 });
    const d = evaluate([allow, denySame], input());
    expect(d.effect).toBe("deny");
    expect(d.reason).toBe("deny_in_band");
  });

  it("gates on max_sensitivity regardless of effect", () => {
    const p = policy({ maxSensitivity: "normal" });
    const d = evaluate([p], input({ memory: { type: "fact", tags: [], sensitivity: "secret" } }));
    expect(d.effect).toBe("deny");
    expect(d.reason).toBe("sensitivity_exceeds_policy");
    expect(d.maxSensitivityAllowed).toBe("normal");
  });

  it("forces secret to manual_only on inject", () => {
    const p = policy({ maxSensitivity: "secret", injectionMode: "auto" });
    const d = evaluate([p], input({ memory: { type: "note", tags: [], sensitivity: "secret" } }));
    expect(d.effect).toBe("allow");
    expect(d.injectionMode).toBe("manual_only");
  });

  it("requires confirmation for private inject", () => {
    const p = policy({ maxSensitivity: "private", injectionMode: "auto" });
    const d = evaluate([p], input({ memory: { type: "fact", tags: [], sensitivity: "private" } }));
    expect(d.injectionMode).toBe("confirm");
    expect(d.requiresConfirmation).toBe(true);
  });

  it("matches type/tag dimensions and ignores expired policies", () => {
    const credDeny = policy({
      id: "cred",
      effect: "deny",
      memoryType: "credential_hint",
      precedence: 1,
    });
    const broad = policy({ id: "broad", precedence: 100 });
    const d = evaluate(
      [credDeny, broad],
      input({ memory: { type: "credential_hint", tags: [], sensitivity: "normal" } }),
    );
    expect(d.effect).toBe("deny"); // type-scoped deny wins by precedence

    const expiredDeny = policy({
      id: "exp",
      effect: "deny",
      precedence: 1,
      expiresAt: "2020-01-01T00:00:00Z",
    });
    expect(evaluate([expiredDeny, broad], input()).effect).toBe("allow");
  });

  it("prefers the more specific allow when precedence ties", () => {
    const broad = policy({ id: "broad", injectionMode: "auto", precedence: 50 });
    const specific = policy({
      id: "specific",
      platform: "claude",
      injectionMode: "confirm",
      precedence: 50,
    });
    const d = evaluate([broad, specific], input({ platform: "claude" }));
    expect(d.matchedPolicyIds).toEqual(["specific"]);
    expect(d.injectionMode).toBe("confirm");
  });
});

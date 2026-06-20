import {
  type Decision,
  type EvalInput,
  type InjectionMode,
  type Policy,
  sensitivityRank,
} from "./types.js";

const MODE_STRICTNESS: Record<InjectionMode, number> = {
  auto: 0,
  confirm: 1,
  manual_only: 2,
  never: 3,
};

/** Null/undefined policy dimension matches anything; otherwise it must equal the input. */
function dimMatch(policyValue: string | null | undefined, inputValue: string | undefined): boolean {
  return policyValue == null || policyValue === inputValue;
}

function tagMatch(policyTag: string | null | undefined, tags: string[]): boolean {
  return policyTag == null || tags.includes(policyTag);
}

function expired(policy: Policy, now: number): boolean {
  return policy.expiresAt != null && Date.parse(policy.expiresAt) <= now;
}

function specificity(p: Policy): number {
  return [p.platform, p.clientId, p.scope, p.purpose, p.memoryType, p.tag].filter((v) => v != null)
    .length;
}

/** Most specific first; ties broken by strictest (mode then lowest max-sensitivity). */
function compareForWinner(a: Policy, b: Policy): number {
  const spec = specificity(b) - specificity(a);
  if (spec !== 0) return spec;
  const mode = MODE_STRICTNESS[b.injectionMode] - MODE_STRICTNESS[a.injectionMode];
  if (mode !== 0) return mode;
  return sensitivityRank(a.maxSensitivity) - sensitivityRank(b.maxSensitivity);
}

function deny(reason: Decision["reason"], matched: string[] = []): Decision {
  return {
    effect: "deny",
    requiresConfirmation: false,
    injectionMode: null,
    maxSensitivityAllowed: null,
    reason,
    matchedPolicyIds: matched,
  };
}

/**
 * Evaluate policies for one (subject, action, memory) tuple. Deterministic per §8.3:
 *
 *  1. collect matching policies (every non-null dimension must match; drop expired)
 *  2. empty match -> default deny
 *  3. take the lowest-precedence band (smallest number = highest priority)
 *  4. any deny in that band -> deny (deny-override only within the winning band)
 *  5. otherwise pick the most-specific / strictest allow
 *  6. apply the max-sensitivity gate, then sensitivity-driven injection defaults
 */
export function evaluate(policies: Policy[], input: EvalInput): Decision {
  const matches = policies.filter(
    (p) =>
      p.tenantId === input.tenantId &&
      p.action === input.action &&
      dimMatch(p.platform, input.platform) &&
      dimMatch(p.clientId, input.clientId) &&
      dimMatch(p.scope, input.scope) &&
      dimMatch(p.purpose, input.purpose) &&
      dimMatch(p.memoryType, input.memory.type) &&
      tagMatch(p.tag, input.memory.tags) &&
      !expired(p, input.now),
  );

  if (matches.length === 0) return deny("default_deny");

  const minPrecedence = Math.min(...matches.map((p) => p.precedence));
  const band = matches.filter((p) => p.precedence === minPrecedence);

  const denies = band.filter((p) => p.effect === "deny");
  if (denies.length > 0) {
    return deny(
      "deny_in_band",
      denies.map((p) => p.id),
    );
  }

  const winner = [...band].sort(compareForWinner)[0]!;

  if (sensitivityRank(input.memory.sensitivity) > sensitivityRank(winner.maxSensitivity)) {
    return {
      ...deny("sensitivity_exceeds_policy", [winner.id]),
      maxSensitivityAllowed: winner.maxSensitivity,
    };
  }

  let mode: InjectionMode = winner.injectionMode;
  if (input.action === "inject") {
    if (input.memory.sensitivity === "secret") {
      mode = "manual_only"; // secret never auto-injects (§8.3)
    } else if (input.memory.sensitivity === "private" && mode === "auto") {
      mode = "confirm"; // private defaults to confirm-before-inject
    }
  }

  const requiresConfirmation =
    input.action === "inject" && (mode === "confirm" || input.memory.sensitivity === "private");

  return {
    effect: "allow",
    requiresConfirmation,
    injectionMode: mode,
    maxSensitivityAllowed: winner.maxSensitivity,
    matchedPolicyIds: [winner.id],
  };
}

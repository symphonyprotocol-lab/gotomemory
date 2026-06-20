export type Sensitivity = "public" | "normal" | "private" | "secret";
export type Action = "create" | "read" | "update" | "delete" | "inject" | "export";
export type Effect = "allow" | "deny";
export type InjectionMode = "auto" | "confirm" | "manual_only" | "never";

/** Sensitivity levels in ascending order — `public < normal < private < secret` (§8.3). */
export const SENSITIVITY_ORDER: readonly Sensitivity[] = ["public", "normal", "private", "secret"];

export function sensitivityRank(s: Sensitivity): number {
  return SENSITIVITY_ORDER.indexOf(s);
}

/** A stored policy row (mirrors `memory_policies`, §8.3). Null dimension = "match any". */
export interface Policy {
  id: string;
  tenantId: string;
  subjectId: string;
  subjectType: string;
  effect: Effect;
  action: Action;
  platform?: string | null;
  clientId?: string | null;
  scope?: string | null;
  purpose?: string | null;
  memoryType?: string | null;
  tag?: string | null;
  maxSensitivity: Sensitivity;
  injectionMode: InjectionMode;
  precedence: number;
  expiresAt?: string | null;
}

export interface EvalInput {
  tenantId: string;
  subjectId: string;
  action: Action;
  platform?: string;
  clientId?: string;
  scope?: string;
  purpose?: string;
  memory: {
    type: string;
    tags: string[];
    sensitivity: Sensitivity;
  };
  /** Epoch millis; defaults to Date.now() at the call site. */
  now: number;
}

export type DenyReason = "default_deny" | "deny_in_band" | "sensitivity_exceeds_policy";

export interface Decision {
  effect: Effect;
  requiresConfirmation: boolean;
  injectionMode: InjectionMode | null;
  maxSensitivityAllowed: Sensitivity | null;
  reason?: DenyReason;
  matchedPolicyIds: string[];
}

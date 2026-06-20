import type { Decision } from "@gotomemory/policy";

export { NotFoundError, VersionConflictError } from "@gotomemory/db";

/** Thrown when policy denies an action. Carries the structured decision (§8.4). */
export class PolicyDeniedError extends Error {
  constructor(
    readonly action: string,
    readonly decision: Decision,
  ) {
    super(`policy denied: ${action} (${decision.reason ?? "deny"})`);
    this.name = "PolicyDeniedError";
  }
}

/** Thrown when a confirmation token is missing, expired, or already consumed. */
export class ConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfirmationError";
  }
}

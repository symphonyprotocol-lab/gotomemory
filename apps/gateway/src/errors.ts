import {
  ConfirmationError,
  NotFoundError,
  PolicyDeniedError,
  VersionConflictError,
} from "@gotomemory/core";

export interface HttpError {
  status: number;
  code: string;
  message: string;
  decisionId?: string | null;
}

/** Map domain errors to the unified error model (system spec §9.8). */
export function mapError(err: unknown): HttpError {
  if (err instanceof PolicyDeniedError) {
    return { status: 403, code: "policy_denied", message: err.message };
  }
  if (err instanceof NotFoundError) {
    return { status: 404, code: "not_found", message: err.message };
  }
  if (err instanceof VersionConflictError) {
    return { status: 409, code: "version_conflict", message: err.message };
  }
  if (err instanceof ConfirmationError) {
    return { status: 404, code: "not_found", message: err.message };
  }
  return { status: 500, code: "internal", message: "internal error" };
}

export function errorBody(code: string, message: string, decisionId: string | null = null) {
  return { error: { code, message, decision_id: decisionId, details: {} } };
}

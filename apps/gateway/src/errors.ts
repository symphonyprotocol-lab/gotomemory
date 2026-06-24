import {
  ConfirmationError,
  NotFoundError,
  PolicyDeniedError,
  VersionConflictError,
} from "@gotomemory/core";
import {
  PageAccessError,
  PageNotFoundError,
  PageValidationError,
  PageVersionConflictError,
} from "@gotomemory/pages";
import { AuthDisabledError, AuthValidationError } from "./auth-service.js";

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
  if (err instanceof PageValidationError) {
    return {
      status: err.code === "artifact_too_large" ? 400 : 400,
      code: err.code,
      message: err.message,
    };
  }
  if (err instanceof PageAccessError) {
    return { status: 403, code: "share_policy_denied", message: err.message };
  }
  if (err instanceof PageNotFoundError) {
    return { status: 404, code: "page_not_found", message: err.message };
  }
  if (err instanceof PageVersionConflictError) {
    return { status: 409, code: "page_version_conflict", message: err.message };
  }
  if (err instanceof AuthValidationError) {
    return { status: 400, code: "invalid_request", message: err.message };
  }
  if (err instanceof AuthDisabledError) {
    return { status: 403, code: "auth_method_disabled", message: err.message };
  }
  return { status: 500, code: "internal", message: "internal error" };
}

export function errorBody(code: string, message: string, decisionId: string | null = null) {
  return { error: { code, message, decision_id: decisionId, details: {} } };
}

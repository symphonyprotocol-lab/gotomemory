/**
 * Map a unified error code (system spec §9.8) to a stable process exit code. This mapping
 * is part of the CLI's public contract for skills (§16.5.1) — changing it is a breaking
 * change, so it is covered by a test.
 */
export function exitCodeFor(code: string): number {
  switch (code) {
    case "invalid_request":
      return 2;
    case "unauthenticated":
      return 3;
    case "policy_denied":
      return 4;
    case "not_found":
      return 5;
    case "version_conflict":
      return 6;
    case "rate_limited":
      return 7;
    default:
      return 1;
  }
}

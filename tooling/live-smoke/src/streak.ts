/**
 * Consecutive-blindness tracking for the nightly live smoke.
 *
 * "Blind" runs (bot-blocked / login-blocked / unreachable) are individually
 * just warnings — but a platform that stays blind run after run means the
 * adapter-survival lifeline has silently stopped seeing that site. This module
 * turns that invisible state into a loud one: the runner persists a small
 * per-platform streak file across runs (CI caches it) and fails the job once a
 * platform has been unverifiable for `threshold` consecutive runs.
 *
 * Pass and selector-failure both reset the streak: either way the page was
 * reachable, so the selectors got judged.
 */

export interface StreakEntry {
  /** Outcome status of the most recent run. */
  status: string;
  /** Consecutive runs in a blind status (0 whenever the page was judgeable). */
  blindRuns: number;
}

export type StreakState = Record<string, StreakEntry>;

const BLIND_STATUSES = new Set(["bot-blocked", "login-blocked", "unreachable"]);

export function isBlindStatus(status: string): boolean {
  return BLIND_STATUSES.has(status);
}

/** Fold one run's outcomes into the persisted streak state. */
export function updateStreaks(
  previous: StreakState,
  results: ReadonlyArray<{ platform: string; status: string }>
): StreakState {
  const next: StreakState = {};
  for (const result of results) {
    const before = previous[result.platform]?.blindRuns ?? 0;
    next[result.platform] = {
      status: result.status,
      blindRuns: isBlindStatus(result.status) ? before + 1 : 0
    };
  }
  return next;
}

/** Human-readable alerts for every platform at or past the blindness threshold. */
export function blindAlerts(state: StreakState, threshold: number): string[] {
  return Object.entries(state)
    .filter(([, entry]) => entry.blindRuns >= threshold)
    .map(
      ([platform, entry]) =>
        `${platform}: selectors unverified for ${entry.blindRuns} consecutive runs ` +
        `(last: ${entry.status}) — provision a storage state / conversation URL or investigate`
    );
}

/** Defensive parse of a persisted state file: anything malformed → empty state. */
export function parseStreakState(raw: string): StreakState {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const state: StreakState = {};
    for (const [platform, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as StreakEntry).status === "string" &&
        typeof (entry as StreakEntry).blindRuns === "number" &&
        Number.isFinite((entry as StreakEntry).blindRuns)
      ) {
        state[platform] = {
          status: (entry as StreakEntry).status,
          blindRuns: Math.max(0, Math.floor((entry as StreakEntry).blindRuns))
        };
      }
    }
    return state;
  } catch {
    return {};
  }
}

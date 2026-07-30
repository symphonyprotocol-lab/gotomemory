/**
 * Local validation metrics (spec §12.4): aggregate counters computed and stored
 * on the user's machine. The local-first discipline applies to our own
 * measurement too — no conversation content, no per-event log, just counts
 * bucketed by ISO week plus the few timestamps the §12.4 decision thresholds
 * need (injects/week, export → first-memory conversion, day-14 retention).
 */

export type MetricEvent = "inject" | "export" | "save";

export interface WeeklyCounts {
  injects: number;
  exports: number;
  saves: number;
}

export interface LocalMetricsState {
  installed_at: string;
  weekly: Record<string, WeeklyCounts>;
  first_export_at: string | null;
  /** First memory saved after the first export — the §12.4 conversion marker. */
  first_memory_after_export_at: string | null;
  /** Distinct local dates (YYYY-MM-DD) with any activity; drives day-14 retention. */
  active_days: string[];
}

export interface MetricsSummary {
  current_week: string;
  current_week_injects: number;
  average_weekly_injects: number;
  export_to_first_memory_converted: boolean;
  day14_retained: boolean;
}

// Keeping every active day forever is unnecessary; a year is far beyond what
// the 14-day retention marker needs.
const MAX_ACTIVE_DAYS = 366;

export function initialMetricsState(now: Date): LocalMetricsState {
  return {
    installed_at: now.toISOString(),
    weekly: {},
    first_export_at: null,
    first_memory_after_export_at: null,
    active_days: []
  };
}

/**
 * `count` records one user action that covered N items — saving a 300-message
 * conversation is 300 saves, not 1. It only scales the weekly counters; the
 * first-export / first-memory markers are per-action by definition.
 */
export function recordMetricEvent(
  state: LocalMetricsState,
  event: MetricEvent,
  now: Date,
  count = 1
): LocalMetricsState {
  const amount = Number.isFinite(count) ? Math.max(1, Math.trunc(count)) : 1;
  const week = isoWeek(now);
  const counts = state.weekly[week] ?? { injects: 0, exports: 0, saves: 0 };
  const weekly = {
    ...state.weekly,
    [week]: {
      injects: counts.injects + (event === "inject" ? amount : 0),
      exports: counts.exports + (event === "export" ? amount : 0),
      saves: counts.saves + (event === "save" ? amount : 0)
    }
  };

  const day = localDate(now);
  const active_days = state.active_days.includes(day)
    ? state.active_days
    : [...state.active_days.slice(-(MAX_ACTIVE_DAYS - 1)), day];

  return {
    ...state,
    weekly,
    active_days,
    first_export_at:
      event === "export" ? (state.first_export_at ?? now.toISOString()) : state.first_export_at,
    first_memory_after_export_at:
      event === "save" && state.first_export_at && !state.first_memory_after_export_at
        ? now.toISOString()
        : state.first_memory_after_export_at
  };
}

export function metricsSummary(state: LocalMetricsState, now: Date): MetricsSummary {
  const current_week = isoWeek(now);
  const weeks = Object.values(state.weekly);
  const totalInjects = weeks.reduce((sum, counts) => sum + counts.injects, 0);

  // `active_days` holds local calendar dates while `installed_at` is a UTC
  // instant, so both sides are compared as local calendar dates: "the user was
  // active on or after the 14th day since install".
  const installed = new Date(state.installed_at);
  const day14 = localDate(new Date(installed.getTime() + 14 * 24 * 60 * 60 * 1000));
  const day14_retained = state.active_days.some((day) => day >= day14);

  return {
    current_week,
    current_week_injects: state.weekly[current_week]?.injects ?? 0,
    average_weekly_injects: weeks.length === 0 ? 0 : totalInjects / weeks.length,
    export_to_first_memory_converted: state.first_memory_after_export_at !== null,
    day14_retained
  };
}

/** ISO-8601 week label, e.g. "2026-W27" (weeks start Monday, week 1 holds Jan 4). */
export function isoWeek(date: Date): string {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Shift to the Thursday of this week; its year is the ISO week-numbering year.
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(utc.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((utc.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

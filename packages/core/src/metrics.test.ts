import { describe, expect, it } from "vitest";

import {
  initialMetricsState,
  isoWeek,
  metricsSummary,
  recordMetricEvent,
  type LocalMetricsState
} from "./metrics.js";

const T0 = new Date("2026-07-03T10:00:00");

function record(state: LocalMetricsState, events: [string, Date][]): LocalMetricsState {
  return events.reduce(
    (current, [event, at]) => recordMetricEvent(current, event as "inject", at),
    state
  );
}

describe("local validation metrics (spec §12.4)", () => {
  it("labels ISO weeks correctly, including year boundaries", () => {
    expect(isoWeek(new Date("2026-07-03T10:00:00"))).toBe("2026-W27");
    // 2026-01-01 is a Thursday → ISO week 1 of 2026.
    expect(isoWeek(new Date("2026-01-01T10:00:00"))).toBe("2026-W01");
    // 2023-01-01 is a Sunday → still ISO week 52 of 2022.
    expect(isoWeek(new Date("2023-01-01T10:00:00"))).toBe("2022-W52");
  });

  it("buckets inject counts by week — the north-star counter", () => {
    const state = record(initialMetricsState(T0), [
      ["inject", new Date("2026-07-03T10:00:00")],
      ["inject", new Date("2026-07-04T10:00:00")],
      ["inject", new Date("2026-07-08T10:00:00")] // next ISO week
    ]);

    expect(state.weekly["2026-W27"]?.injects).toBe(2);
    expect(state.weekly["2026-W28"]?.injects).toBe(1);
    const summary = metricsSummary(state, new Date("2026-07-08T12:00:00"));
    expect(summary.current_week_injects).toBe(1);
    expect(summary.average_weekly_injects).toBe(1.5);
  });

  it("marks export → first-memory conversion only for saves after the first export", () => {
    let state = initialMetricsState(T0);
    state = recordMetricEvent(state, "save", new Date("2026-07-03T10:05:00"));
    expect(metricsSummary(state, T0).export_to_first_memory_converted).toBe(false);

    const exportAt = new Date("2026-07-03T10:10:00");
    state = recordMetricEvent(state, "export", exportAt);
    state = recordMetricEvent(state, "save", new Date("2026-07-03T10:15:00"));
    expect(state.first_export_at).toBe(exportAt.toISOString());
    expect(metricsSummary(state, T0).export_to_first_memory_converted).toBe(true);

    // Later saves don't move the conversion timestamp.
    const converted_at = state.first_memory_after_export_at;
    state = recordMetricEvent(state, "save", new Date("2026-07-05T09:00:00"));
    expect(state.first_memory_after_export_at).toBe(converted_at);
  });

  it("reports day-14 retention from active days", () => {
    let state = initialMetricsState(T0);
    state = recordMetricEvent(state, "inject", new Date("2026-07-05T10:00:00"));
    expect(metricsSummary(state, new Date("2026-08-01T00:00:00")).day14_retained).toBe(false);

    state = recordMetricEvent(state, "inject", new Date("2026-07-18T10:00:00"));
    expect(metricsSummary(state, new Date("2026-08-01T00:00:00")).day14_retained).toBe(true);
  });

  it("keeps only aggregate counts — no content, no per-event log", () => {
    const state = recordMetricEvent(initialMetricsState(T0), "inject", T0);
    const serialized = JSON.stringify(state);
    expect(Object.keys(state)).toEqual([
      "installed_at",
      "weekly",
      "first_export_at",
      "first_memory_after_export_at",
      "active_days"
    ]);
    // Nothing but numbers, week labels, dates and ISO timestamps.
    expect(serialized).not.toMatch(/content|topic|message/);
  });
});

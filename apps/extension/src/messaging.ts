import type {
  ContextRequest,
  ContextResponse,
  Memory,
  PauseMemoryRequest,
  SaveMemoryRequest,
  SearchMemoriesRequest,
  UpdateMemoryRequest
} from "@gotomemory/contracts";
import type { LocalMetricsState, MetricEvent, MetricsSummary } from "@gotomemory/core";
import { isLocalePreference, type LocalePreference } from "@gotomemory/i18n";
import type { SelectorOverrides } from "@gotomemory/site-adapters";

/**
 * User-facing switches (spec §6.1 信任模式, §5.0 onboarding, §12.4 metrics).
 * Stored in the extension's own storage next to the memories.
 */
export interface ExtensionSettings {
  /** First-run export guidance dismissed (by exporting once). */
  onboarded: boolean;
  /** Trust mode: auto-inject non-private memories, visibly and undoably. */
  trust_mode: boolean;
  /** Local aggregate usage counters; user-visible and switchable. */
  metrics_enabled: boolean;
  /** UI language; "auto" (the default) follows the browser on every load. */
  locale: LocalePreference;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  onboarded: false,
  trust_mode: false,
  metrics_enabled: true,
  locale: "auto"
};

/**
 * Validate a settings patch before it is merged into storage. Unlike
 * memory.save/saveMany (validateSaveMemoryRequest), settings.update previously
 * spread the raw message body straight into the stored blob — a malformed
 * payload (build skew, future bug) would silently corrupt persisted settings.
 * Unknown/mistyped keys are dropped rather than rejected outright, since a
 * forward-compatible sender may legitimately send a patch this build doesn't
 * fully understand yet.
 */
export function validateSettingsPatch(input: unknown): Partial<ExtensionSettings> {
  if (typeof input !== "object" || input === null) {
    return {};
  }
  const record = input as Record<string, unknown>;
  const patch: Partial<ExtensionSettings> = {};
  if (typeof record.onboarded === "boolean") {
    patch.onboarded = record.onboarded;
  }
  if (typeof record.trust_mode === "boolean") {
    patch.trust_mode = record.trust_mode;
  }
  if (typeof record.metrics_enabled === "boolean") {
    patch.metrics_enabled = record.metrics_enabled;
  }
  if (isLocalePreference(record.locale)) {
    patch.locale = record.locale;
  }
  return patch;
}

export interface MetricsReport {
  state: LocalMetricsState;
  summary: MetricsSummary;
}

export type ExtensionMessage =
  | { type: "memory.save"; input: SaveMemoryRequest }
  | { type: "memory.saveMany"; input: SaveMemoryRequest[] }
  | { type: "memory.search"; input: SearchMemoriesRequest }
  | { type: "memory.context"; input: ContextRequest }
  | { type: "memory.update"; id: string; input: UpdateMemoryRequest }
  | { type: "memory.remove"; id: string }
  | { type: "memory.removeMany"; ids: string[] }
  | { type: "memory.pause"; id: string; input: PauseMemoryRequest }
  | { type: "memory.resume"; id: string; input: PauseMemoryRequest }
  | { type: "settings.get" }
  | { type: "settings.update"; input: Partial<ExtensionSettings> }
  | { type: "metrics.record"; input: { event: MetricEvent } }
  | { type: "metrics.get" }
  | { type: "selectors.get" };

export type ExtensionMessageResponse =
  | {
      ok: true;
      value:
        | Memory
        | Memory[]
        | ContextResponse
        | ExtensionSettings
        | MetricsReport
        | SelectorOverrides
        | null;
    }
  | { ok: false; error: string };

export function createRuntimeMessenger(
  sendMessage: (message: ExtensionMessage) => Promise<ExtensionMessageResponse>
) {
  return {
    async save(input: SaveMemoryRequest): Promise<Memory> {
      return unwrap(await sendMessage({ type: "memory.save", input })) as Memory;
    },
    async saveMany(inputs: SaveMemoryRequest[]): Promise<Memory[]> {
      return unwrap(await sendMessage({ type: "memory.saveMany", input: inputs })) as Memory[];
    },
    async search(input: SearchMemoriesRequest = {}): Promise<Memory[]> {
      return unwrap(await sendMessage({ type: "memory.search", input })) as Memory[];
    },
    async context(input: ContextRequest): Promise<ContextResponse> {
      return unwrap(await sendMessage({ type: "memory.context", input })) as ContextResponse;
    },
    async update(id: string, input: UpdateMemoryRequest): Promise<Memory> {
      return unwrap(await sendMessage({ type: "memory.update", id, input })) as Memory;
    },
    async remove(id: string): Promise<void> {
      unwrap(await sendMessage({ type: "memory.remove", id }));
    },
    async removeMany(ids: string[]): Promise<void> {
      unwrap(await sendMessage({ type: "memory.removeMany", ids }));
    },
    async pause(id: string, input: PauseMemoryRequest): Promise<void> {
      unwrap(await sendMessage({ type: "memory.pause", id, input }));
    },
    async resume(id: string, input: PauseMemoryRequest): Promise<void> {
      unwrap(await sendMessage({ type: "memory.resume", id, input }));
    },
    async getSettings(): Promise<ExtensionSettings> {
      return unwrap(await sendMessage({ type: "settings.get" })) as ExtensionSettings;
    },
    async updateSettings(input: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
      return unwrap(await sendMessage({ type: "settings.update", input })) as ExtensionSettings;
    },
    async recordMetric(event: MetricEvent): Promise<void> {
      unwrap(await sendMessage({ type: "metrics.record", input: { event } }));
    },
    async getMetrics(): Promise<MetricsReport> {
      return unwrap(await sendMessage({ type: "metrics.get" })) as MetricsReport;
    },
    async getSelectorOverrides(): Promise<SelectorOverrides | null> {
      return unwrap(await sendMessage({ type: "selectors.get" })) as SelectorOverrides | null;
    }
  };
}

function unwrap(response: ExtensionMessageResponse): unknown {
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.value;
}

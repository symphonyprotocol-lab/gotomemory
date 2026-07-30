import { validateSaveMemoryRequest } from "@gotomemory/contracts";
import {
  initialMetricsState,
  makeMemoryService,
  metricsSummary,
  recordMetricEvent,
  type LocalMetricsState,
  type MetricEvent
} from "@gotomemory/core";
import { KeywordRetrievalEngine, type RetrievalEngine } from "@gotomemory/retrieval";
import { sanitizeSelectorOverrides, type SelectorOverrides } from "@gotomemory/site-adapters";
import { InMemoryMemoryStore, type MemoryStore } from "@gotomemory/store";

import { InMemoryKeyValueStore, type KeyValueStore } from "./kv.js";
import {
  DEFAULT_SETTINGS,
  validateSettingsPatch,
  type ExtensionMessage,
  type ExtensionMessageResponse,
  type ExtensionSettings
} from "./messaging.js";
import { SELECTOR_OVERRIDES_KEY } from "./selector-config.js";

export interface BackgroundHandlerDeps {
  store?: MemoryStore;
  retrieval?: RetrievalEngine;
  kv?: KeyValueStore;
  now?: () => Date;
}

const SETTINGS_KEY = "gotomemory:settings";
const METRICS_KEY = "gotomemory:metrics";

export function createBackgroundHandlers(deps: BackgroundHandlerDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const service = makeMemoryService({
    store: deps.store ?? new InMemoryMemoryStore(),
    retrieval: deps.retrieval ?? new KeywordRetrievalEngine(),
    now
  });
  const kv = deps.kv ?? new InMemoryKeyValueStore();

  const withSettingDefaults = (stored: unknown): ExtensionSettings => ({
    ...DEFAULT_SETTINGS,
    ...(stored as Partial<ExtensionSettings> | undefined)
  });

  const readSettings = async (): Promise<ExtensionSettings> =>
    withSettingDefaults(await kv.get(SETTINGS_KEY));

  // Aggregate counts only, and only while the user-visible switch is on
  // (spec §12.4). Metric failures must never fail the user action being counted.
  // `count` carries how many items the action covered, so a 300-message
  // "save all" is 300 saves rather than 1.
  const countMetric = async (event: MetricEvent, count = 1): Promise<void> => {
    try {
      if (!(await readSettings()).metrics_enabled) {
        return;
      }
      // Read-modify-write through kv.update: a metric landing while another
      // metric (or a settings save) is in flight must not clobber it.
      await kv.update(METRICS_KEY, (stored) =>
        recordMetricEvent(
          (stored as LocalMetricsState | undefined) ?? initialMetricsState(now()),
          event,
          now(),
          count
        )
      );
    } catch {
      // ignore: metrics are best-effort by design
    }
  };

  return async function handleMessage(
    message: ExtensionMessage
  ): Promise<ExtensionMessageResponse> {
    try {
      switch (message.type) {
        // Inbound messages are validated even though only our own content
        // scripts can send them: a selector regression that captures a stray
        // node should be rejected at the boundary, not persisted as a memory.
        case "memory.save": {
          const saved = await service.save(validateSaveMemoryRequest(message.input));
          await countMetric("save");
          return { ok: true, value: saved };
        }
        case "memory.saveMany": {
          const inputs = (Array.isArray(message.input) ? message.input : []).map(
            validateSaveMemoryRequest
          );
          const saved = await service.saveMany(inputs);
          await countMetric("save", saved.length);
          return { ok: true, value: saved };
        }
        case "memory.search":
          return { ok: true, value: await service.search(message.input) };
        case "memory.context":
          return { ok: true, value: await service.context(message.input) };
        case "memory.update":
          return { ok: true, value: await service.update(message.id, message.input) };
        case "memory.remove":
          await service.remove(message.id);
          return { ok: true, value: null };
        case "memory.removeMany":
          await service.removeMany(message.ids);
          return { ok: true, value: null };
        case "memory.pause":
          await service.pause(message.id, message.input);
          return { ok: true, value: null };
        case "memory.resume":
          await service.resume(message.id, message.input);
          return { ok: true, value: null };
        case "settings.get":
          return { ok: true, value: await readSettings() };
        case "settings.update": {
          const patch = validateSettingsPatch(message.input);
          const settings = await kv.update(SETTINGS_KEY, (stored) => ({
            ...withSettingDefaults(stored),
            ...patch
          }));
          return { ok: true, value: settings };
        }
        case "metrics.record":
          await countMetric(message.input.event);
          return { ok: true, value: null };
        case "metrics.get": {
          const state =
            ((await kv.get(METRICS_KEY)) as LocalMetricsState | undefined) ??
            initialMetricsState(now());
          return { ok: true, value: { state, summary: metricsSummary(state, now()) } };
        }
        case "selectors.get": {
          const stored = await kv.get(SELECTOR_OVERRIDES_KEY);
          return {
            ok: true,
            value: stored ? sanitizeSelectorOverrides(stored as SelectorOverrides) : null
          };
        }
        default:
          return { ok: false, error: `unknown message: ${(message as { type: string }).type}` };
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "unknown error" };
    }
  };
}

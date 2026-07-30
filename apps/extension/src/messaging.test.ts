import {
  ChromeStorageDriver,
  PersistentJsonMemoryStore,
  type ChromeStorageArea
} from "@gotomemory/store";
import { describe, expect, it } from "vitest";

import { createBackgroundHandlers } from "./handlers.js";
import { InMemoryKeyValueStore } from "./kv.js";
import { createRuntimeMessenger } from "./messaging.js";
import {
  refreshSelectorOverrides,
  SELECTOR_OVERRIDES_URL,
  SELECTOR_REFRESH_INTERVAL_MS
} from "./selector-config.js";

describe("extension messaging", () => {
  it("saves memory and builds context through typed runtime messages", async () => {
    const handle = createBackgroundHandlers();
    const messenger = createRuntimeMessenger(handle);

    const saved = await messenger.save({ content: "Prefer TypeScript", source: "chatgpt" });
    const context = await messenger.context({ platform: "claude", topic: "typescript" });

    expect(saved.content).toBe("Prefer TypeScript");
    expect(context.ready.map((memory) => memory.id)).toEqual([saved.id]);
  });

  it("persists memories across service-worker restarts via the injected store", async () => {
    // Local-first guarantee (spec §6.3/§7): a saved memory must survive the
    // background being torn down and re-created. Share one backing storage area
    // between two handler instances to simulate service-worker eviction.
    const backing: Record<string, unknown> = {};
    const area: ChromeStorageArea = {
      async get(key) {
        return typeof key === "string" ? { [key]: backing[key] } : { ...backing };
      },
      async set(items) {
        Object.assign(backing, items);
      }
    };
    const makeMessenger = () =>
      createRuntimeMessenger(
        createBackgroundHandlers({
          store: new PersistentJsonMemoryStore(new ChromeStorageDriver(area))
        })
      );

    const saved = await makeMessenger().save({ content: "Prefer TypeScript", source: "chatgpt" });

    const afterRestart = await makeMessenger().context({ platform: "claude", topic: "typescript" });
    expect(afterRestart.ready.map((memory) => memory.id)).toEqual([saved.id]);
  });

  it("persists settings with conservative defaults (trust off, metrics on, language auto)", async () => {
    const kv = new InMemoryKeyValueStore();
    const messenger = createRuntimeMessenger(createBackgroundHandlers({ kv }));

    expect(await messenger.getSettings()).toEqual({
      onboarded: false,
      trust_mode: false,
      metrics_enabled: true,
      locale: "auto"
    });

    await messenger.updateSettings({ trust_mode: true, onboarded: true, locale: "zh" });

    // A fresh handler over the same storage sees the persisted settings.
    const restarted = createRuntimeMessenger(createBackgroundHandlers({ kv }));
    expect(await restarted.getSettings()).toEqual({
      onboarded: true,
      trust_mode: true,
      metrics_enabled: true,
      locale: "zh"
    });
  });

  it("ignores a language it cannot render instead of storing it", async () => {
    const kv = new InMemoryKeyValueStore();
    const messenger = createRuntimeMessenger(createBackgroundHandlers({ kv }));

    await messenger.updateSettings({ locale: "fr" } as never);

    expect((await messenger.getSettings()).locale).toBe("auto");
  });

  it("counts injects/exports/saves as weekly aggregates (spec §12.4)", async () => {
    const messenger = createRuntimeMessenger(
      createBackgroundHandlers({ now: () => new Date("2026-07-03T10:00:00") })
    );

    await messenger.recordMetric("export");
    await messenger.save({ content: "Prefer TypeScript", source: "chatgpt" }); // auto-counted save
    await messenger.recordMetric("inject");
    await messenger.recordMetric("inject");

    const report = await messenger.getMetrics();
    expect(report.state.weekly["2026-W27"]).toEqual({ injects: 2, exports: 1, saves: 1 });
    expect(report.summary.current_week_injects).toBe(2);
    expect(report.summary.export_to_first_memory_converted).toBe(true);
    // Aggregates only: no memory content anywhere in the metrics state.
    expect(JSON.stringify(report.state)).not.toContain("Prefer TypeScript");
  });

  it("stops counting the moment the user switches metrics off", async () => {
    const messenger = createRuntimeMessenger(createBackgroundHandlers());

    await messenger.recordMetric("inject");
    await messenger.updateSettings({ metrics_enabled: false });
    await messenger.recordMetric("inject");
    await messenger.save({ content: "not counted", source: "manual" });

    const report = await messenger.getMetrics();
    const totalInjects = Object.values(report.state.weekly).reduce((n, w) => n + w.injects, 0);
    const totalSaves = Object.values(report.state.weekly).reduce((n, w) => n + w.saves, 0);
    expect(totalInjects).toBe(1);
    expect(totalSaves).toBe(0);
  });

  it("serves verified remote selector overrides to content scripts", async () => {
    const kv = new InMemoryKeyValueStore();
    const messenger = createRuntimeMessenger(createBackgroundHandlers({ kv }));

    // Nothing stored yet → content scripts keep built-in selectors.
    expect(await messenger.getSelectorOverrides()).toBeNull();

    // Sign a config with a throwaway key and refresh through the injected fetch.
    const subtle = globalThis.crypto.subtle;
    const keyPair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify"
    ]);
    const publicKey = await subtle.exportKey("jwk", keyPair.publicKey);
    const sign = async (version: number, selectors: unknown) => {
      const payload = JSON.stringify({ version, selectors });
      const signature = Buffer.from(
        await subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          keyPair.privateKey,
          new TextEncoder().encode(payload)
        )
      ).toString("base64");
      return { payload, signature };
    };
    const serve = (document: { payload: string; signature: string }) =>
      (async (url: unknown) => {
        expect(String(url)).toBe(SELECTOR_OVERRIDES_URL);
        return new Response(JSON.stringify(document), { status: 200 });
      }) as typeof fetch;

    const v2 = await sign(2, { chatgpt: { inputSelector: "textarea.hotfix" } });
    const applied = await refreshSelectorOverrides({ kv, fetchFn: serve(v2), publicKey });
    expect(applied).toEqual({ chatgpt: { inputSelector: "textarea.hotfix" } });
    expect(await messenger.getSelectorOverrides()).toEqual({
      chatgpt: { inputSelector: "textarea.hotfix" }
    });

    // A bad signature must not clobber the stored good config.
    const badFetch = (async () =>
      new Response(JSON.stringify({ payload: v2.payload, signature: "AAAA" }), {
        status: 200
      })) as typeof fetch;
    expect(
      await refreshSelectorOverrides({ kv, fetchFn: badFetch, publicKey, force: true })
    ).toBeUndefined();
    expect(await messenger.getSelectorOverrides()).toEqual({
      chatgpt: { inputSelector: "textarea.hotfix" }
    });

    // Replay: a correctly-signed OLDER config must not roll selectors back.
    const v1 = await sign(1, { chatgpt: { inputSelector: "textarea.stale" } });
    expect(
      await refreshSelectorOverrides({ kv, fetchFn: serve(v1), publicKey, force: true })
    ).toBeUndefined();
    expect(await messenger.getSelectorOverrides()).toEqual({
      chatgpt: { inputSelector: "textarea.hotfix" }
    });

    // A newer config still applies.
    const v3 = await sign(3, { chatgpt: { inputSelector: "textarea.newer" } });
    expect(
      await refreshSelectorOverrides({ kv, fetchFn: serve(v3), publicKey, force: true })
    ).toEqual({ chatgpt: { inputSelector: "textarea.newer" } });
  });

  it("backs off config fetches instead of hitting the endpoint on every worker start", async () => {
    const kv = new InMemoryKeyValueStore();
    let calls = 0;
    const fetchFn = (async () => {
      calls += 1;
      return new Response("{}", { status: 500 });
    }) as typeof fetch;

    let clock = 1_000_000;
    const deps = { kv, fetchFn, now: () => clock };

    await refreshSelectorOverrides(deps);
    await refreshSelectorOverrides(deps);
    await refreshSelectorOverrides(deps);
    expect(calls).toBe(1);

    // Past the interval, it tries again.
    clock += SELECTOR_REFRESH_INTERVAL_MS + 1;
    await refreshSelectorOverrides(deps);
    expect(calls).toBe(2);
  });
});

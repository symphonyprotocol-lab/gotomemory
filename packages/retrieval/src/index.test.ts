import { describe, expect, it } from "vitest";

import { KeywordRetrievalEngine, rankMemories, tokenize } from "./index.js";

describe("keyword retrieval", () => {
  it("tokenizes words across punctuation", () => {
    expect(tokenize("React + TypeScript, please")).toEqual(["react", "typescript", "please"]);
  });

  it("tokenizes CJK into character bigrams for keyword overlap", () => {
    expect(tokenize("潮汐表")).toEqual(["潮汐", "汐表"]);
    expect(tokenize("typescript严格模式")).toEqual(["typescript", "严格", "格模", "模式"]);
  });

  it("ranks relevant Chinese memories by topic, not just recency", () => {
    const results = rankMemories("潮汐", [
      memory("mem_weather", "吉隆坡今天多云，降雨概率高", "2026-06-24T02:00:00.000Z"),
      memory("mem_tide", "巴生港潮汐表：高潮 13:54", "2026-06-24T01:00:00.000Z")
    ]);

    // The tide memory is older but matches the topic, so it must rank first.
    expect(results.map((result) => result.id)).toEqual(["mem_tide"]);
  });

  it("ranks exact content matches above stale fallback matches", () => {
    const results = rankMemories("typescript react", [
      memory("mem_old", "Use Python for scripts", "2026-06-20T00:00:00.000Z"),
      memory("mem_new", "Prefer TypeScript for React apps", "2026-06-21T00:00:00.000Z")
    ]);

    expect(results.map((result) => result.id)).toEqual(["mem_new"]);
  });

  it("uses recency as tie breaker", () => {
    const results = rankMemories("typescript", [
      memory("mem_old", "TypeScript", "2026-06-20T00:00:00.000Z"),
      memory("mem_new", "TypeScript", "2026-06-21T00:00:00.000Z")
    ]);

    expect(results.map((result) => result.id)).toEqual(["mem_new", "mem_old"]);
  });
});

describe("KeywordRetrievalEngine", () => {
  it("ranks the same as the stateless rankMemories function", async () => {
    const engine = new KeywordRetrievalEngine();
    const memories = [
      memory("mem_weather", "吉隆坡今天多云，降雨概率高", "2026-06-24T02:00:00.000Z"),
      memory("mem_tide", "巴生港潮汐表：高潮 13:54", "2026-06-24T01:00:00.000Z")
    ];

    const ranked = await engine.rank("潮汐", memories);
    expect(ranked.map((m) => m.id)).toEqual(["mem_tide"]);
  });

  it("re-tokenizes a memory after it changes instead of serving a stale cache entry", async () => {
    const engine = new KeywordRetrievalEngine();
    const original = memory("mem_1", "Use pnpm for installs", "2026-06-24T00:00:00.000Z");

    expect((await engine.rank("typescript", [original])).map((m) => m.id)).toEqual([]);

    // Same id, new content and a bumped updated_at: the cached tokens for
    // mem_1 must not be reused, or this would still miss.
    const edited = memory("mem_1", "Prefer TypeScript everywhere", "2026-06-24T00:00:01.000Z");
    expect((await engine.rank("typescript", [edited])).map((m) => m.id)).toEqual(["mem_1"]);
  });

  it("respects the limit parameter", async () => {
    const engine = new KeywordRetrievalEngine();
    const memories = Array.from({ length: 5 }, (_, i) =>
      memory(`mem_${i}`, "TypeScript", `2026-06-2${i}T00:00:00.000Z`)
    );

    expect(await engine.rank("typescript", memories, 2)).toHaveLength(2);
  });
});

function memory(id: string, content: string, updated_at: string) {
  return {
    id,
    user_id: "local",
    content,
    category: "preference" as const,
    is_private: false,
    source: "manual" as const,
    embedding: null,
    rev: 0,
    deleted_at: null,
    created_at: updated_at,
    updated_at
  };
}

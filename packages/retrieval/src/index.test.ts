import { describe, expect, it } from "vitest";

import {
  HashEmbeddingModel,
  SemanticRetrievalEngine,
  cosineSimilarity,
  rankMemories,
  tokenize,
  type EmbeddingModel
} from "./index.js";

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

  it("computes cosine similarity for semantic ranking", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("uses deterministic browser-safe hash embeddings when no model has been downloaded", async () => {
    const model = new HashEmbeddingModel(8);

    await expect(model.embed("TypeScript React")).resolves.toHaveLength(8);
    await expect(model.embed("TypeScript React")).resolves.toEqual(
      await model.embed("TypeScript React")
    );
  });

  it("semantically ranks memories and falls back to keyword ranking when the model fails", async () => {
    const failingModel: EmbeddingModel = {
      async embed() {
        throw new Error("model unavailable");
      }
    };
    const engine = new SemanticRetrievalEngine(failingModel);

    const results = await engine.rank("typescript", [
      memory("mem_1", "Prefer TypeScript", "2026-06-21T00:00:00.000Z"),
      memory("mem_2", "Prefer Python", "2026-06-22T00:00:00.000Z")
    ]);

    expect(results.map((result) => result.id)).toEqual(["mem_1"]);
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

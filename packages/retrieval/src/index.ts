import type { Memory } from "@gotomemory/contracts";

export interface RetrievalEngine {
  rank(query: string, memories: Memory[], limit?: number): Promise<Memory[]>;
}

export interface EmbeddingModel {
  embed(text: string): Promise<number[]>;
}

export class KeywordRetrievalEngine implements RetrievalEngine {
  async rank(query: string, memories: Memory[], limit = 20): Promise<Memory[]> {
    return rankMemories(query, memories).slice(0, limit);
  }
}

export class HashEmbeddingModel implements EmbeddingModel {
  readonly #dimensions: number;

  constructor(dimensions = 64) {
    this.#dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const vector = new Array(this.#dimensions).fill(0);
    for (const term of tokenize(text)) {
      const index = hashTerm(term) % this.#dimensions;
      vector[index] += 1;
    }
    return normalizeVector(vector);
  }
}

export class SemanticRetrievalEngine implements RetrievalEngine {
  readonly #model: EmbeddingModel;
  readonly #fallback: RetrievalEngine;

  constructor(
    model: EmbeddingModel = new HashEmbeddingModel(),
    fallback: RetrievalEngine = new KeywordRetrievalEngine()
  ) {
    this.#model = model;
    this.#fallback = fallback;
  }

  async rank(query: string, memories: Memory[], limit = 20): Promise<Memory[]> {
    if (query.trim() === "") {
      return this.#fallback.rank(query, memories, limit);
    }

    try {
      const queryEmbedding = await this.#model.embed(query);
      const ranked = await Promise.all(
        memories.map(async (memory) => {
          const embedding = memory.embedding?.length
            ? memory.embedding
            : await this.#model.embed(memory.content);
          return {
            memory,
            score: cosineSimilarity(queryEmbedding, embedding),
            keywordScore: scoreMemory(tokenize(query), memory)
          };
        })
      );

      return ranked
        .filter((item) => item.score > 0 || item.keywordScore > 0)
        .sort((left, right) => {
          const scoreDelta =
            right.score + right.keywordScore * 0.05 - (left.score + left.keywordScore * 0.05);
          if (scoreDelta !== 0) {
            return scoreDelta;
          }
          return right.memory.updated_at.localeCompare(left.memory.updated_at);
        })
        .slice(0, limit)
        .map((item) => item.memory);
    } catch {
      return this.#fallback.rank(query, memories, limit);
    }
  }
}

export function rankMemories(query: string, memories: Memory[]): Memory[] {
  const terms = tokenize(query);

  return memories
    .map((memory) => ({
      memory,
      score: scoreMemory(terms, memory)
    }))
    .filter((item) => item.score > 0 || terms.length === 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.memory.updated_at.localeCompare(left.memory.updated_at);
    })
    .map((item) => item.memory);
}

export function scoreMemory(queryTerms: string[], memory: Memory): number {
  if (queryTerms.length === 0) {
    return 1;
  }

  const haystack = tokenize(`${memory.content} ${memory.category} ${memory.source}`);
  const unique = new Set(haystack);
  let score = 0;

  for (const term of queryTerms) {
    if (unique.has(term)) {
      score += 2;
    } else if (haystack.some((candidate) => candidate.includes(term) || term.includes(candidate))) {
      score += 1;
    }
  }

  return score;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

// CJK has no word separators, so splitting on non-letters keeps a whole phrase
// as a single token and keyword overlap never matches. Emit Latin/number words
// whole and CJK as character bigrams (the standard cheap CJK indexing trick) so
// "潮汐表" and "巴生港潮汐表" share the "潮汐"/"汐表" tokens.
const CJK_CHAR = /[㐀-鿿぀-ヿ가-힯豈-﫿ｦ-ﾟㇰ-ㇿ]/u;

export function tokenize(text: string): string[] {
  const lower = text.toLocaleLowerCase();
  const out: string[] = [];
  let word = "";
  let cjk = "";
  const flushWord = (): void => {
    if (word) {
      out.push(word);
      word = "";
    }
  };
  const flushCjk = (): void => {
    if (cjk.length === 1) {
      out.push(cjk);
    } else {
      for (let i = 0; i < cjk.length - 1; i += 1) {
        out.push(cjk.slice(i, i + 2));
      }
    }
    cjk = "";
  };

  for (const char of lower) {
    if (CJK_CHAR.test(char)) {
      flushWord();
      cjk += char;
    } else if (/[\p{L}\p{N}]/u.test(char)) {
      flushCjk();
      word += char;
    } else {
      flushWord();
      flushCjk();
    }
  }
  flushWord();
  flushCjk();
  return out;
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}

function hashTerm(term: string): number {
  let hash = 2166136261;
  for (let index = 0; index < term.length; index += 1) {
    hash ^= term.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

import type { Memory } from "@gotomemory/contracts";

/**
 * Keyword retrieval over locally-stored memories.
 *
 * A hash-embedding "semantic" engine used to live here as an alternative
 * implementation. Nothing ever wired it up, and it could not be wired up as-is:
 * `Memory.embedding` is always null, so every search would have had to embed
 * every memory on every call — strictly worse than the keyword path it was
 * meant to improve on. Removed rather than left as a trap; a real semantic
 * ranker needs embeddings persisted at save time, which is a different design.
 */
export interface RetrievalEngine {
  rank(query: string, memories: Memory[], limit?: number): Promise<Memory[]>;
}

/**
 * Keeps per-memory tokenization across calls: `rank()` used to re-tokenize
 * every memory's content from scratch on every search, which scales with
 * total stored content (not query size) under `unlimitedStorage` +
 * whole-conversation capture. Cached per instance, invalidated per memory by
 * `updated_at` so an edited memory is re-tokenized instead of serving a stale
 * entry.
 */
export class KeywordRetrievalEngine implements RetrievalEngine {
  readonly #cache = new Map<string, { updatedAt: string; tokens: string[] }>();

  async rank(query: string, memories: Memory[], limit = 20): Promise<Memory[]> {
    const terms = tokenize(query);
    return rankByScore(
      memories,
      (memory) => scoreMemory(terms, memory, this.#haystack(memory)),
      terms.length === 0
    ).slice(0, limit);
  }

  #haystack(memory: Memory): string[] {
    const cached = this.#cache.get(memory.id);
    if (cached && cached.updatedAt === memory.updated_at) {
      return cached.tokens;
    }
    const tokens = haystackTokens(memory);
    this.#cache.set(memory.id, { updatedAt: memory.updated_at, tokens });
    return tokens;
  }
}

export function rankMemories(query: string, memories: Memory[]): Memory[] {
  const terms = tokenize(query);
  return rankByScore(memories, (memory) => scoreMemory(terms, memory), terms.length === 0);
}

function rankByScore(
  memories: Memory[],
  score: (memory: Memory) => number,
  matchAll: boolean
): Memory[] {
  return memories
    .map((memory) => ({ memory, score: score(memory) }))
    .filter((item) => item.score > 0 || matchAll)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.memory.updated_at.localeCompare(left.memory.updated_at);
    })
    .map((item) => item.memory);
}

function haystackTokens(memory: Memory): string[] {
  return tokenize(`${memory.content} ${memory.category} ${memory.source}`);
}

export function scoreMemory(
  queryTerms: string[],
  memory: Memory,
  precomputedHaystack?: string[]
): number {
  if (queryTerms.length === 0) {
    return 1;
  }

  const haystack = precomputedHaystack ?? haystackTokens(memory);
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

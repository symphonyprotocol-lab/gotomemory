import type {
  ContextRequest,
  ContextResponse,
  Memory,
  PauseMemoryRequest,
  SaveMemoryRequest,
  SearchMemoriesRequest,
  UpdateMemoryRequest
} from "./types.js";

export interface GotomemoryClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  token?: string;
}

/**
 * Lightweight fetch client for the memory operations defined in
 * openapi/memory.yaml (spec §8). In MVP these run locally inside the extension;
 * once cross-device sync is enabled the same contract is reused against the
 * sync service, so local and cloud "speak the same language".
 */
export function createGotomemoryClient(options: GotomemoryClientOptions) {
  const fetchImpl = options.fetch ?? fetch;
  const headers = () => ({
    "content-type": "application/json",
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
  });

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(new URL(path, options.baseUrl), {
      ...init,
      headers: {
        ...headers(),
        ...init?.headers
      }
    });

    if (!response.ok) {
      throw new Error(`gotomemory request failed: ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  return {
    saveMemory(input: SaveMemoryRequest) {
      return request<Memory>("/v1/memories", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    searchMemories(query: SearchMemoriesRequest = {}) {
      const params = new URLSearchParams();
      if (query.q !== undefined) {
        params.set("q", query.q);
      }
      if (query.limit !== undefined) {
        params.set("limit", String(query.limit));
      }
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return request<Memory[]>(`/v1/memories${suffix}`);
    },
    buildContext(input: ContextRequest) {
      return request<ContextResponse>("/v1/context", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    updateMemory(id: string, input: UpdateMemoryRequest) {
      return request<Memory>(`/v1/memories/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      });
    },
    deleteMemory(id: string) {
      return request<void>(`/v1/memories/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
    },
    pauseMemory(id: string, input: PauseMemoryRequest) {
      return request<void>(`/v1/memories/${encodeURIComponent(id)}/pause`, {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    resumeMemory(id: string, input: PauseMemoryRequest) {
      return request<void>(`/v1/memories/${encodeURIComponent(id)}/pause`, {
        method: "DELETE",
        body: JSON.stringify(input)
      });
    }
  };
}

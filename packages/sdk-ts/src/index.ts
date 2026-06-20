import type {
  ContextBuildRequest,
  ContextBuildResponse,
  ContextConfirmRequest,
  CreateMemoryRequest,
  CreateMemoryResponse,
  MemoryRead,
  paths,
  SearchRequest,
  SearchResponse,
  UpdateMemoryRequest,
} from "@gotomemory/contracts";
import createOpenapiClient from "openapi-fetch";

export interface ClientOptions {
  /** Base URL including the API version, e.g. http://localhost:8787/v1 */
  baseUrl: string;
  /** Bearer token (OAuth access token or API token). */
  token: string;
  /** Custom fetch (tests, proxies). Defaults to global fetch. */
  fetch?: typeof fetch;
}

/** Error carrying the unified error envelope code (system spec §9.8). */
export class SdkError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SdkError";
  }
}

interface Result<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function unwrap<T>(result: Result<T>): T {
  if (result.error !== undefined) {
    const env = result.error as { error?: { code?: string; message?: string } };
    throw new SdkError(
      env.error?.code ?? "internal",
      env.error?.message ?? `request failed (${result.response.status})`,
      result.response.status,
    );
  }
  return result.data as T;
}

export interface GotomemoryClient {
  memories: {
    create(body: CreateMemoryRequest): Promise<CreateMemoryResponse>;
    search(body: SearchRequest): Promise<SearchResponse>;
    read(id: string, purpose: string): Promise<MemoryRead>;
    update(id: string, body: UpdateMemoryRequest): Promise<CreateMemoryResponse>;
    delete(id: string): Promise<void>;
  };
  context: {
    build(body: ContextBuildRequest): Promise<ContextBuildResponse>;
    confirm(body: ContextConfirmRequest): Promise<ContextBuildResponse>;
  };
}

export function createClient(options: ClientOptions): GotomemoryClient {
  const client = createOpenapiClient<paths>({
    baseUrl: options.baseUrl,
    headers: { Authorization: `Bearer ${options.token}` },
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  return {
    memories: {
      async create(body) {
        return unwrap(await client.POST("/memories", { body }));
      },
      async search(body) {
        return unwrap(await client.POST("/memories/search", { body }));
      },
      async read(id, purpose) {
        return unwrap(
          await client.GET("/memories/{id}", { params: { path: { id }, query: { purpose } } }),
        );
      },
      async update(id, body) {
        return unwrap(await client.PATCH("/memories/{id}", { params: { path: { id } }, body }));
      },
      async delete(id) {
        const result = await client.DELETE("/memories/{id}", { params: { path: { id } } });
        if (result.error !== undefined) unwrap(result);
      },
    },
    context: {
      async build(body) {
        return unwrap(await client.POST("/context/build", { body }));
      },
      async confirm(body) {
        return unwrap(await client.POST("/context/confirm", { body }));
      },
    },
  };
}

export type {
  ContextBuildRequest,
  ContextBuildResponse,
  ContextConfirmRequest,
  CreateMemoryRequest,
  CreateMemoryResponse,
  MemoryRead,
  SearchRequest,
  SearchResponse,
  UpdateMemoryRequest,
} from "@gotomemory/contracts";

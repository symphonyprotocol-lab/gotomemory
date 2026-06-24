import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthMeResponse,
  AuthProvider,
  ContextBuildRequest,
  ContextBuildResponse,
  ContextConfirmRequest,
  CreatePageRequest,
  CreatePageVersionRequest,
  CreateMemoryRequest,
  CreateMemoryResponse,
  MemoryRead,
  PageListResponse,
  PageResponse,
  PublicPageResponse,
  paths,
  SearchRequest,
  SearchResponse,
  UpdatePageRequest,
  UpdateMemoryRequest,
} from "@gotomemory/contracts";
import createOpenapiClient from "openapi-fetch";

export interface ClientOptions {
  /** Base URL including the API version, e.g. http://localhost:8787/v1 */
  baseUrl: string;
  /** Bearer token (OAuth access token or API token). */
  token?: string;
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
  auth: {
    login(body: AuthLoginRequest): Promise<AuthLoginResponse>;
    me(): Promise<AuthMeResponse>;
    logout(): Promise<void>;
  };
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
  pages: {
    create(body: CreatePageRequest): Promise<PageResponse>;
    list(limit?: number): Promise<PageListResponse>;
    get(id: string): Promise<PageResponse>;
    getPublic(slug: string): Promise<PublicPageResponse>;
    update(id: string, body: UpdatePageRequest): Promise<PageResponse>;
    createVersion(id: string, body: CreatePageVersionRequest): Promise<PageResponse>;
    unpublish(id: string): Promise<void>;
  };
}

export function createClient(options: ClientOptions): GotomemoryClient {
  const client = createOpenapiClient<paths>({
    baseUrl: options.baseUrl,
    headers: options.token ? { Authorization: `Bearer ${options.token}` } : {},
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  return {
    auth: {
      async login(body) {
        return unwrap(await client.POST("/auth/login", { body }));
      },
      async me() {
        return unwrap(await client.GET("/auth/me"));
      },
      async logout() {
        const result = await client.POST("/auth/logout");
        if (result.error !== undefined) unwrap(result);
      },
    },
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
    pages: {
      async create(body) {
        return unwrap(await client.POST("/pages", { body }));
      },
      async list(limit) {
        return unwrap(
          await client.GET("/pages", {
            params: { query: { ...(limit === undefined ? {} : { limit }) } },
          }),
        );
      },
      async get(id) {
        return unwrap(await client.GET("/pages/{id}", { params: { path: { id } } }));
      },
      async getPublic(slug) {
        return unwrap(await client.GET("/pages/public/{slug}", { params: { path: { slug } } }));
      },
      async update(id, body) {
        return unwrap(await client.PATCH("/pages/{id}", { params: { path: { id } }, body }));
      },
      async createVersion(id, body) {
        return unwrap(
          await client.POST("/pages/{id}/versions", { params: { path: { id } }, body }),
        );
      },
      async unpublish(id) {
        const result = await client.DELETE("/pages/{id}", { params: { path: { id } } });
        if (result.error !== undefined) unwrap(result);
      },
    },
  };
}

export type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthMeResponse,
  AuthProvider,
  ContextBuildRequest,
  ContextBuildResponse,
  ContextConfirmRequest,
  CreatePageRequest,
  CreatePageVersionRequest,
  CreateMemoryRequest,
  CreateMemoryResponse,
  MemoryRead,
  PageListResponse,
  PageResponse,
  PublicPageResponse,
  SearchRequest,
  SearchResponse,
  UpdatePageRequest,
  UpdateMemoryRequest,
} from "@gotomemory/contracts";

import type {
  CreateShareRequest,
  CreateShareResponse,
  PublicShareLockedResponse,
  PublicShareResponse,
  ShareListResponse,
  UnlockShareRequest,
  UnlockShareResponse,
  UpdateShareRequest
} from "./types.js";

export interface GotomemoryClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  token?: string;
}

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

    return (await response.json()) as T;
  }

  return {
    createShare(input: CreateShareRequest) {
      return request<CreateShareResponse>("/v1/shares", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    listShares() {
      return request<ShareListResponse>("/v1/shares");
    },
    updateShare(id: string, input: UpdateShareRequest) {
      return request(`/v1/shares/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      });
    },
    deleteShare(id: string) {
      return request(`/v1/shares/${id}`, {
        method: "DELETE"
      });
    },
    getPublicShare(slug: string, viewToken?: string) {
      return request<PublicShareResponse | PublicShareLockedResponse>(`/v1/shares/public/${slug}`, {
        headers: viewToken ? { authorization: `Bearer ${viewToken}` } : undefined
      });
    },
    unlockShare(slug: string, input: UnlockShareRequest) {
      return request<UnlockShareResponse>(`/v1/shares/public/${slug}/unlock`, {
        method: "POST",
        body: JSON.stringify(input)
      });
    }
  };
}

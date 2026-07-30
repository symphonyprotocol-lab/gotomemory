import {
  createGotomemoryClient,
  type ContextRequest,
  type ContextResponse,
  type GotomemoryClientOptions,
  type Memory,
  type SaveMemoryRequest,
  type SearchMemoriesRequest
} from "@gotomemory/contracts";
import { formatAuthorizedMemoryPrompt } from "@gotomemory/core";

export class GotomemorySdk {
  readonly #client: ReturnType<typeof createGotomemoryClient>;

  constructor(options: GotomemoryClientOptions) {
    this.#client = createGotomemoryClient(options);
  }

  saveMemory(input: SaveMemoryRequest): Promise<Memory> {
    return this.#client.saveMemory(input);
  }

  searchMemories(query?: SearchMemoriesRequest): Promise<Memory[]> {
    return this.#client.searchMemories(query);
  }

  buildContext(input: ContextRequest): Promise<ContextResponse> {
    return this.#client.buildContext(input);
  }
}

/**
 * Re-exported from `@gotomemory/core` rather than reimplemented: this is the
 * prompt-injection framing around user memories, and two hand-maintained copies
 * of it would drift apart exactly where drift is most dangerous.
 */
export const buildContextPrompt = formatAuthorizedMemoryPrompt;

import type {
  ContextRequest,
  ContextResponse,
  Memory,
  PauseMemoryRequest,
  SaveMemoryRequest,
  SearchMemoriesRequest,
  UpdateMemoryRequest
} from "@gotomemory/contracts";

export type ExtensionMessage =
  | { type: "memory.save"; input: SaveMemoryRequest }
  | { type: "memory.search"; input: SearchMemoriesRequest }
  | { type: "memory.context"; input: ContextRequest }
  | { type: "memory.update"; id: string; input: UpdateMemoryRequest }
  | { type: "memory.remove"; id: string }
  | { type: "memory.pause"; id: string; input: PauseMemoryRequest }
  | { type: "memory.resume"; id: string; input: PauseMemoryRequest };

export type ExtensionMessageResponse =
  | { ok: true; value: Memory | Memory[] | ContextResponse | null }
  | { ok: false; error: string };

export function createRuntimeMessenger(
  sendMessage: (message: ExtensionMessage) => Promise<ExtensionMessageResponse>
) {
  return {
    async save(input: SaveMemoryRequest): Promise<Memory> {
      return unwrap(await sendMessage({ type: "memory.save", input })) as Memory;
    },
    async search(input: SearchMemoriesRequest = {}): Promise<Memory[]> {
      return unwrap(await sendMessage({ type: "memory.search", input })) as Memory[];
    },
    async context(input: ContextRequest): Promise<ContextResponse> {
      return unwrap(await sendMessage({ type: "memory.context", input })) as ContextResponse;
    },
    async update(id: string, input: UpdateMemoryRequest): Promise<Memory> {
      return unwrap(await sendMessage({ type: "memory.update", id, input })) as Memory;
    },
    async remove(id: string): Promise<void> {
      unwrap(await sendMessage({ type: "memory.remove", id }));
    },
    async pause(id: string, input: PauseMemoryRequest): Promise<void> {
      unwrap(await sendMessage({ type: "memory.pause", id, input }));
    },
    async resume(id: string, input: PauseMemoryRequest): Promise<void> {
      unwrap(await sendMessage({ type: "memory.resume", id, input }));
    }
  };
}

function unwrap(response: ExtensionMessageResponse): unknown {
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.value;
}

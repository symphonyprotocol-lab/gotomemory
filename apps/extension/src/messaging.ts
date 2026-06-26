import type {
  ContextRequest,
  ContextResponse,
  Memory,
  PauseMemoryRequest,
  SaveMemoryRequest
} from "@gotomemory/contracts";

export type ExtensionMessage =
  | { type: "memory.save"; input: SaveMemoryRequest }
  | { type: "memory.context"; input: ContextRequest }
  | { type: "memory.pause"; id: string; input: PauseMemoryRequest }
  | { type: "memory.resume"; id: string; input: PauseMemoryRequest };

export type ExtensionMessageResponse =
  | { ok: true; value: Memory | ContextResponse | null }
  | { ok: false; error: string };

export function createRuntimeMessenger(
  sendMessage: (message: ExtensionMessage) => Promise<ExtensionMessageResponse>
) {
  return {
    async save(input: SaveMemoryRequest): Promise<Memory> {
      return unwrap(await sendMessage({ type: "memory.save", input })) as Memory;
    },
    async context(input: ContextRequest): Promise<ContextResponse> {
      return unwrap(await sendMessage({ type: "memory.context", input })) as ContextResponse;
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

import { buildContextPrompt } from "@gotomemory/sdk";

export interface JsonRpcRequest {
  id?: string | number;
  method: string;
  params?: unknown;
}

export async function handleMcpRequest(request: JsonRpcRequest) {
  if (request.method === "tools/list") {
    return {
      id: request.id,
      result: {
        tools: [
          {
            name: "build_context",
            description: "Build a prompt-safe gotomemory context block",
            inputSchema: {
              type: "object",
              properties: {
                memories: {
                  type: "array",
                  items: { type: "string" }
                }
              },
              required: ["memories"]
            }
          }
        ]
      }
    };
  }

  if (request.method === "tools/call") {
    const params = request.params as { name?: string; arguments?: { memories?: string[] } };
    if (params.name === "build_context") {
      const prompt = buildContextPrompt(
        (params.arguments?.memories ?? []).map((content) => ({ content }))
      );
      return {
        id: request.id,
        result: {
          content: [{ type: "text", text: prompt }]
        }
      };
    }
  }

  return {
    id: request.id,
    error: {
      code: -32601,
      message: "Method not found"
    }
  };
}

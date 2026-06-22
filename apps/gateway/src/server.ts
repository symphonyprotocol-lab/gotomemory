import type {
  ContextBuildRequest,
  ContextConfirmRequest,
  CreateMemoryRequest,
  SearchRequest,
  UpdateMemoryRequest,
} from "@gotomemory/contracts";
import type { MemoryService, RequestContext } from "@gotomemory/core";
import cors from "@fastify/cors";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { type AuthResolver, devAuthResolver } from "./auth.js";
import { errorBody, mapError } from "./errors.js";
import { openApiSchema, ref } from "./schemas.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Auth-resolved context, set by the onRequest hook before validation/handlers run. */
    gmContext?: RequestContext;
  }
}

export interface ServerOptions {
  service: MemoryService;
  auth?: AuthResolver;
  /** Enable permissive CORS so the browser console/extension can call the gateway. */
  cors?: boolean;
}

/** The auth hook guarantees this is set for every non-public route. */
function ctxOf(req: FastifyRequest): RequestContext {
  if (!req.gmContext) throw new Error("missing request context");
  return req.gmContext;
}

export function buildServer(opts: ServerOptions): FastifyInstance {
  const app = Fastify({
    logger: false,
    // OpenAPI 3.1 schemas use union types (`[string, "null"]`) and `additionalProperties:
    // false`. Reject unknown/extra fields rather than silently stripping them, and don't
    // let unknown formats (date-time) fail schema compilation.
    ajv: {
      customOptions: {
        coerceTypes: true,
        useDefaults: true,
        removeAdditional: false,
        strict: false,
      },
    },
  });
  const auth = opts.auth ?? devAuthResolver;
  const { service } = opts;

  if (opts.cors) {
    void app.register(cors, { origin: true });
  }

  // Request-body/query schemas are derived from the OpenAPI contract (see schemas.ts).
  app.addSchema(openApiSchema());

  // Authenticate before validation runs, so a missing credential is a 401 even when the
  // body is also malformed (validation would otherwise short-circuit to 400).
  app.addHook("onRequest", async (req, reply) => {
    if (req.method === "OPTIONS") return; // CORS preflight
    if (req.url.split("?")[0] === "/health") return;
    const ctx = auth(req);
    if (!ctx) {
      return reply.code(401).send(errorBody("unauthenticated", "missing or invalid credentials"));
    }
    req.gmContext = ctx;
  });

  // Single error funnel: schema-validation failures become invalid_request (400); domain
  // errors map to the unified error model (§9.8); everything else is a non-leaking 500.
  app.setErrorHandler((err: FastifyError, _req, reply: FastifyReply) => {
    if (err.validation) {
      return reply.code(400).send(errorBody("invalid_request", err.message));
    }
    const mapped = mapError(err);
    if (mapped.status >= 500) console.error(err);
    return reply
      .code(mapped.status)
      .send(errorBody(mapped.code, mapped.message, mapped.decisionId));
  });

  app.get("/health", () => ({ status: "ok" }));

  app.post("/v1/memories", { schema: { body: ref("CreateMemoryRequest") } }, async (req, reply) =>
    reply.code(201).send(await service.createMemory(ctxOf(req), req.body as CreateMemoryRequest)),
  );

  app.post("/v1/memories/search", { schema: { body: ref("SearchRequest") } }, async (req, reply) =>
    reply.send(await service.searchMemories(ctxOf(req), req.body as SearchRequest)),
  );

  app.get(
    "/v1/memories/:id",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["purpose"],
          properties: { purpose: { type: "string" } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { purpose } = req.query as { purpose: string };
      const result = await service.readMemory(ctxOf(req), id, purpose);
      return reply.header("ETag", String(result.version)).send(result);
    },
  );

  app.patch(
    "/v1/memories/:id",
    { schema: { body: ref("UpdateMemoryRequest") } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      return reply.send(
        await service.updateMemory(ctxOf(req), id, req.body as UpdateMemoryRequest),
      );
    },
  );

  app.delete("/v1/memories/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = await service.deleteMemory(ctxOf(req), id);
    return ok
      ? reply.code(204).send()
      : reply.code(404).send(errorBody("not_found", `memory not found: ${id}`));
  });

  app.post(
    "/v1/context/build",
    { schema: { body: ref("ContextBuildRequest") } },
    async (req, reply) =>
      reply.send(await service.buildContext(ctxOf(req), req.body as ContextBuildRequest)),
  );

  app.post(
    "/v1/context/confirm",
    { schema: { body: ref("ContextConfirmRequest") } },
    async (req, reply) =>
      reply.send(await service.confirmContext(ctxOf(req), req.body as ContextConfirmRequest)),
  );

  return app;
}

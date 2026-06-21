import type {
  ContextBuildRequest,
  ContextConfirmRequest,
  CreateMemoryRequest,
  SearchRequest,
  UpdateMemoryRequest,
} from "@gotomemory/contracts";
import type { MemoryService, RequestContext } from "@gotomemory/core";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { type AuthResolver, devAuthResolver } from "./auth.js";
import { errorBody, mapError } from "./errors.js";

export interface ServerOptions {
  service: MemoryService;
  auth?: AuthResolver;
  /** Enable permissive CORS so the browser console/extension can call the gateway. */
  cors?: boolean;
}

export function buildServer(opts: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  const auth = opts.auth ?? devAuthResolver;
  const { service } = opts;

  if (opts.cors) {
    void app.register(cors, { origin: true });
  }

  const guard = (req: FastifyRequest, reply: FastifyReply): RequestContext | null => {
    const ctx = auth(req);
    if (!ctx) {
      void reply.code(401).send(errorBody("unauthenticated", "missing or invalid credentials"));
      return null;
    }
    return ctx;
  };

  const fail = (reply: FastifyReply, err: unknown): FastifyReply => {
    const mapped = mapError(err);
    return reply
      .code(mapped.status)
      .send(errorBody(mapped.code, mapped.message, mapped.decisionId));
  };

  app.get("/health", () => ({ status: "ok" }));

  app.post("/v1/memories", async (req, reply) => {
    const ctx = guard(req, reply);
    if (!ctx) return;
    try {
      return reply.code(201).send(await service.createMemory(ctx, req.body as CreateMemoryRequest));
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post("/v1/memories/search", async (req, reply) => {
    const ctx = guard(req, reply);
    if (!ctx) return;
    try {
      return reply.send(await service.searchMemories(ctx, req.body as SearchRequest));
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get("/v1/memories/:id", async (req, reply) => {
    const ctx = guard(req, reply);
    if (!ctx) return;
    const { id } = req.params as { id: string };
    const purpose = (req.query as { purpose?: string }).purpose;
    if (!purpose) {
      return reply.code(400).send(errorBody("invalid_request", "purpose is required"));
    }
    try {
      const result = await service.readMemory(ctx, id, purpose);
      return reply.header("ETag", String(result.version)).send(result);
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.patch("/v1/memories/:id", async (req, reply) => {
    const ctx = guard(req, reply);
    if (!ctx) return;
    const { id } = req.params as { id: string };
    try {
      return reply.send(await service.updateMemory(ctx, id, req.body as UpdateMemoryRequest));
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.delete("/v1/memories/:id", async (req, reply) => {
    const ctx = guard(req, reply);
    if (!ctx) return;
    const { id } = req.params as { id: string };
    try {
      const ok = await service.deleteMemory(ctx, id);
      return ok
        ? reply.code(204).send()
        : reply.code(404).send(errorBody("not_found", `memory not found: ${id}`));
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post("/v1/context/build", async (req, reply) => {
    const ctx = guard(req, reply);
    if (!ctx) return;
    try {
      return reply.send(await service.buildContext(ctx, req.body as ContextBuildRequest));
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.post("/v1/context/confirm", async (req, reply) => {
    const ctx = guard(req, reply);
    if (!ctx) return;
    try {
      return reply.send(await service.confirmContext(ctx, req.body as ContextConfirmRequest));
    } catch (err) {
      return fail(reply, err);
    }
  });

  return app;
}

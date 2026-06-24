import type {
  ContextBuildRequest,
  ContextConfirmRequest,
  CreateMemoryRequest,
  SearchRequest,
  UpdateMemoryRequest,
} from "@gotomemory/contracts";
import type { MemoryService, RequestContext } from "@gotomemory/core";
import type {
  CreatePageRequest,
  CreatePageVersionRequest,
  PageService,
  UpdatePageRequest,
} from "@gotomemory/pages";
import cors from "@fastify/cors";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { type AuthResolver, bearerToken, devAuthResolver } from "./auth.js";
import type { AuthLoginRequest, AuthService } from "./auth-service.js";
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
  pages?: PageService;
  authService?: AuthService;
  auth?: AuthResolver;
  /** Enable permissive CORS so the browser console/extension can call the gateway. */
  cors?: boolean;
}

/** The auth hook guarantees this is set for every non-public route. */
function ctxOf(req: FastifyRequest): RequestContext {
  if (!req.gmContext) throw new Error("missing request context");
  return req.gmContext;
}

function pageCtx(ctx: RequestContext) {
  return {
    tenantId: ctx.tenantId,
    ownerId: ctx.ownerId,
    subjectId: ctx.subjectId,
    clientId: ctx.clientId,
  };
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
    const path = req.url.split("?")[0] ?? "";
    if (path === "/health") return;
    if (path === "/v1/auth/login") return;
    if (path.startsWith("/v1/pages/public/")) return;
    const ctx = await auth(req);
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

  if (opts.authService) {
    const authService = opts.authService;
    app.post("/v1/auth/login", { schema: { body: ref("AuthLoginRequest") } }, async (req, reply) =>
      reply.code(201).send(await authService.login(req.body as AuthLoginRequest)),
    );

    app.get("/v1/auth/me", async (req, reply) => {
      const token = bearerToken(req);
      const user = token ? await authService.me(token) : null;
      return user
        ? reply.send({ user })
        : reply.code(401).send(errorBody("unauthenticated", "invalid session"));
    });

    app.post("/v1/auth/logout", async (req, reply) => {
      const token = bearerToken(req);
      if (token) await authService.logout(token);
      return reply.code(204).send();
    });
  }

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

  if (opts.pages) {
    const pages = opts.pages;
    app.post("/v1/pages", { schema: { body: ref("CreatePageRequest") } }, async (req, reply) =>
      reply
        .code(201)
        .send(await pages.createPage(pageCtx(ctxOf(req)), req.body as CreatePageRequest)),
    );

    app.get("/v1/pages", async (req, reply) => {
      const limit = Number((req.query as { limit?: string | number }).limit ?? 20);
      return reply.send(await pages.listPages(pageCtx(ctxOf(req)), limit));
    });

    app.get("/v1/pages/:id", async (req, reply) => {
      const { id } = req.params as { id: string };
      return reply.send(await pages.getPage(pageCtx(ctxOf(req)), id));
    });

    app.get("/v1/pages/public/:slug", async (req, reply) => {
      const { slug } = req.params as { slug: string };
      const optionalCtx = await auth(req);
      return reply.send(
        await pages.getPublicPage(slug, optionalCtx ? pageCtx(optionalCtx) : undefined),
      );
    });

    app.patch(
      "/v1/pages/:id",
      { schema: { body: ref("UpdatePageRequest") } },
      async (req, reply) => {
        const { id } = req.params as { id: string };
        return reply.send(
          await pages.updatePage(pageCtx(ctxOf(req)), id, req.body as UpdatePageRequest),
        );
      },
    );

    app.post(
      "/v1/pages/:id/versions",
      { schema: { body: ref("CreatePageVersionRequest") } },
      async (req, reply) => {
        const { id } = req.params as { id: string };
        return reply
          .code(201)
          .send(
            await pages.createVersion(
              pageCtx(ctxOf(req)),
              id,
              req.body as CreatePageVersionRequest,
            ),
          );
      },
    );

    app.delete("/v1/pages/:id", async (req, reply) => {
      const { id } = req.params as { id: string };
      const ok = await pages.unpublishPage(pageCtx(ctxOf(req)), id);
      return ok
        ? reply.code(204).send()
        : reply.code(404).send(errorBody("page_not_found", `page not found: ${id}`));
    });
  }

  return app;
}

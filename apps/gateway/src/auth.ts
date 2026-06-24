import type { RequestContext } from "@gotomemory/core";
import type { AuthRepository } from "@gotomemory/db";
import type { FastifyRequest } from "fastify";

export type AuthResolver = (
  req: FastifyRequest,
) => RequestContext | null | Promise<RequestContext | null>;

function header(req: FastifyRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function bearerToken(req: FastifyRequest): string | null {
  const authorization = header(req, "authorization");
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match ? match[1]!.trim() : null;
}

/**
 * Development auth resolver. Accepts `Authorization: Bearer <tenant>:<subject>` and lets
 * `x-tenant-id` / `x-subject-id` / `x-client-id` / `x-platform` headers override. A real
 * deployment swaps this for OAuth/API-token verification (system spec §13.2) — the route
 * layer only depends on this resolver returning a RequestContext.
 */
export const devAuthResolver: AuthResolver = (req) => {
  const token = bearerToken(req);
  if (!token) return null;
  if (!token.includes(":")) return null;
  const [tenant = "t1", subject = "u1"] = token.split(":");
  const tenantId = header(req, "x-tenant-id") ?? tenant;
  const subjectId = header(req, "x-subject-id") ?? subject;
  return {
    tenantId,
    subjectId,
    ownerId: subjectId,
    clientId: header(req, "x-client-id") ?? "gateway",
    platform: header(req, "x-platform"),
  };
};

export function repositoryAuthResolver(repo: AuthRepository): AuthResolver {
  return async (req) => {
    const token = bearerToken(req);
    if (!token) return null;
    const session = await repo.getSession(token, new Date().toISOString());
    if (!session) return null;
    return {
      tenantId: session.tenantId,
      subjectId: session.userId,
      ownerId: session.userId,
      clientId: header(req, "x-client-id") ?? "web",
      platform: header(req, "x-platform"),
    };
  };
}

/**
 * Session-backed auth with an *opt-in* development fallback. The `devAuthResolver` fallback
 * accepts forgeable `tenant:subject` bearer tokens and `x-*` header overrides, so it must
 * never be enabled in production — leaving it on is a full authentication bypass. Callers
 * pass `allowDevFallback: true` only for local/dev/test wiring; it is off by default so
 * production (and any caller that forgets the flag) is session-only.
 */
export function combinedAuthResolver(
  repo: AuthRepository,
  opts: { allowDevFallback?: boolean } = {},
): AuthResolver {
  const sessionAuth = repositoryAuthResolver(repo);
  if (!opts.allowDevFallback) return sessionAuth;
  return async (req) => (await sessionAuth(req)) ?? devAuthResolver(req);
}

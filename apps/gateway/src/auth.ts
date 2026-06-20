import type { RequestContext } from "@gotomemory/core";
import type { FastifyRequest } from "fastify";

export type AuthResolver = (req: FastifyRequest) => RequestContext | null;

function header(req: FastifyRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Development auth resolver. Accepts `Authorization: Bearer <tenant>:<subject>` and lets
 * `x-tenant-id` / `x-subject-id` / `x-client-id` / `x-platform` headers override. A real
 * deployment swaps this for OAuth/API-token verification (system spec §13.2) — the route
 * layer only depends on this resolver returning a RequestContext.
 */
export const devAuthResolver: AuthResolver = (req) => {
  const authorization = header(req, "authorization");
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return null;
  const [tenant = "t1", subject = "u1"] = match[1]!.trim().split(":");
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

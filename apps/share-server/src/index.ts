import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import {
  LOCAL_USER_ID,
  validateCreateShareRequest,
  type ApiError,
  type CreateShareRequest,
  type CreateShareResponse,
  type SharedConversation,
  type ShareListResponse,
  type UpdateShareRequest
} from "@gotomemory/contracts";

import { InMemoryShareRepository, type ShareRecord, type ShareRepository } from "./repository.js";

export interface ShareAppOptions {
  publicBaseUrl?: string;
  userId?: string;
  now?: () => Date;
  secret?: string;
  repository?: ShareRepository;
}

export function createShareApp(options: ShareAppOptions = {}) {
  const repository = options.repository ?? new InMemoryShareRepository();
  const unlockAttempts = new Map<string, number[]>();
  const tokenSecret = options.secret ?? "dev-secret-change-me";
  const now = options.now ?? (() => new Date());
  const userId = options.userId ?? LOCAL_USER_ID;
  const publicBaseUrl = options.publicBaseUrl ?? "https://gotomemory.dev";

  async function fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method === "POST" && path === "/v1/shares") {
        const input = validateCreateShareRequest(await json(request));
        const share = createShare(input);
        await repository.create(share);
        const response: CreateShareResponse = {
          id: share.id,
          url: `${publicBaseUrl}/p/${share.slug}`,
          visibility: share.visibility,
          status: share.status,
          expires_at: share.expires_at
        };
        return jsonResponse(response, 201);
      }

      if (request.method === "GET" && path === "/v1/shares") {
        const response: ShareListResponse = {
          shares: (await repository.listByUser(userId)).map(publicOwnedShare)
        };
        return jsonResponse(response);
      }

      const ownedMatch = path.match(/^\/v1\/shares\/([^/]+)$/);
      if (ownedMatch?.[1]) {
        const id = ownedMatch[1];
        const share = await repository.getById(id);
        if (!share || share.user_id !== userId) {
          return error("share_not_found", "Share not found", 404);
        }

        if (request.method === "GET") {
          return jsonResponse(publicOwnedShare(share));
        }

        if (request.method === "PATCH") {
          const updated = updateShare(share, (await json(request)) as UpdateShareRequest);
          await repository.update(updated);
          return jsonResponse(publicOwnedShare(updated));
        }

        if (request.method === "DELETE") {
          await repository.update({ ...share, status: "deleted", messages: [] });
          return new Response(null, { status: 204 });
        }
      }

      const publicMatch = path.match(/^\/v1\/shares\/public\/([^/]+)$/);
      if (request.method === "GET" && publicMatch?.[1]) {
        const share = await repository.findBySlug(publicMatch[1]);
        if (!share || isUnavailable(share, now())) {
          return error("share_not_found", "Share not found", 404);
        }

        if (
          share.visibility === "password" &&
          !isValidViewToken(request, share.slug, tokenSecret, now())
        ) {
          return jsonResponse(
            {
              status: "password_required",
              title: share.title,
              visibility: "password"
            },
            401
          );
        }

        const viewed = await repository.update({ ...share, view_count: share.view_count + 1 });
        return jsonResponse({ status: "ok", share: publicOwnedShare(viewed) });
      }

      const unlockMatch = path.match(/^\/v1\/shares\/public\/([^/]+)\/unlock$/);
      if (request.method === "POST" && unlockMatch?.[1]) {
        const slug = unlockMatch[1];
        const share = await repository.findBySlug(slug);
        if (!share || isUnavailable(share, now())) {
          return error("share_not_found", "Share not found", 404);
        }

        if (isRateLimited(unlockAttempts, slug, now())) {
          return error("rate_limited", "Too many unlock attempts", 429);
        }

        const body = (await json(request)) as { password?: string };
        if (!share.password_hash || !verifyPassword(body.password ?? "", share.password_hash)) {
          recordAttempt(unlockAttempts, slug, now());
          return error("invalid_password", "Invalid password", 403);
        }

        const expiresAt = new Date(now().getTime() + 30 * 60 * 1000);
        return jsonResponse({
          view_token: signViewToken(slug, expiresAt, tokenSecret),
          expires_at: expiresAt.toISOString()
        });
      }

      return error("share_not_found", "Route not found", 404);
    } catch (cause) {
      return error("bad_request", cause instanceof Error ? cause.message : "Bad request", 400);
    }
  }

  function createShare(input: CreateShareRequest): ShareRecord {
    const createdAt = now();
    const visibility = input.visibility ?? "public";
    const title = input.title || neutralTitle(input.source_platform, createdAt);
    const expiresAt = input.expires_in_hours
      ? new Date(createdAt.getTime() + input.expires_in_hours * 60 * 60 * 1000).toISOString()
      : null;

    return {
      id: `sc_${randomBytes(8).toString("hex")}`,
      user_id: userId,
      slug: randomBytes(16).toString("base64url"),
      title,
      source_platform: input.source_platform,
      messages: input.messages,
      visibility,
      password_hash: visibility === "password" ? hashPassword(input.password ?? "") : undefined,
      status: "active",
      expires_at: expiresAt,
      view_count: 0,
      created_at: createdAt.toISOString()
    };
  }

  return { fetch, repository };
}

function updateShare(share: ShareRecord, patch: UpdateShareRequest): ShareRecord {
  const visibility = patch.visibility ?? share.visibility;
  const passwordHash =
    visibility === "password"
      ? patch.password === null
        ? share.password_hash
        : patch.password
          ? hashPassword(patch.password)
          : share.password_hash
      : undefined;

  return {
    ...share,
    title: patch.title ?? share.title,
    visibility,
    password_hash: passwordHash,
    expires_at: patch.expires_at === undefined ? share.expires_at : patch.expires_at,
    status: patch.status ?? share.status
  };
}

function publicOwnedShare(share: ShareRecord): SharedConversation {
  const {
    password_hash: _passwordHash,
    messages_object_key: _messagesObjectKey,
    ...safeShare
  } = share;
  return safeShare;
}

function isUnavailable(share: SharedConversation, now: Date): boolean {
  return (
    share.status !== "active" || Boolean(share.expires_at && new Date(share.expires_at) <= now)
  );
}

function neutralTitle(platform: CreateShareRequest["source_platform"], now: Date): string {
  const label = platform ? `${platform[0]?.toUpperCase()}${platform.slice(1)}` : "AI";
  return `${label} conversation · ${now.toISOString().slice(0, 10)}`;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 32).toString("base64url");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) {
    return false;
  }

  const candidate = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "base64url");
  return candidate.byteLength === expected.byteLength && timingSafeEqual(candidate, expected);
}

function signViewToken(slug: string, expiresAt: Date, secret: string): string {
  const payload = `${slug}|${expiresAt.toISOString()}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

function isValidViewToken(request: Request, slug: string, secret: string, now: Date): boolean {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;
  if (!token) {
    return false;
  }

  const [payload64, signature] = token.split(".");
  if (!payload64 || !signature) {
    return false;
  }

  const payload = Buffer.from(payload64, "base64url").toString("utf8");
  const [tokenSlug, expiresAt] = payload.split("|");
  if (tokenSlug !== slug || !expiresAt || new Date(expiresAt) <= now) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  return signature === expected;
}

function isRateLimited(attempts: Map<string, number[]>, slug: string, now: Date): boolean {
  const windowStart = now.getTime() - 60_000;
  const recent = (attempts.get(slug) ?? []).filter((timestamp) => timestamp >= windowStart);
  attempts.set(slug, recent);
  return recent.length >= 5;
}

function recordAttempt(attempts: Map<string, number[]>, slug: string, now: Date): void {
  attempts.set(slug, [...(attempts.get(slug) ?? []), now.getTime()]);
}

async function json(request: Request): Promise<unknown> {
  return request.headers.get("content-length") === "0" ? {} : request.json();
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

function error(code: ApiError["error"]["code"], message: string, status: number): Response {
  return jsonResponse({ error: { code, message } } satisfies ApiError, status);
}

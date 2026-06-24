import { randomBytes, randomUUID } from "node:crypto";
import { decodeContent, mimeFor, sha256 } from "./content.js";
import { PageAccessError, PageNotFoundError, PageValidationError } from "./errors.js";
import type { PageRepository } from "./repository.js";
import type { PageStorage } from "./storage.js";
import type {
  CreatePageRequest,
  CreatePageVersionRequest,
  ExpiresIn,
  PageKind,
  PageListResponse,
  PageRequestContext,
  PageResponse,
  PageSource,
  PageVisibility,
  PublicPageResponse,
  SharedPage,
  SharedPageVersion,
  UpdatePageRequest,
} from "./types.js";

const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface PageServiceDeps {
  repo: PageRepository;
  storage: PageStorage;
  publicBaseUrl?: string;
  clock?: () => number;
  ids?: () => string;
  slugs?: () => string;
}

function bytes(input: string): number {
  return Buffer.byteLength(input, "utf8");
}

const TEXT_KINDS: ReadonlySet<PageKind> = new Set<PageKind>(["html", "markdown"]);

/** Allowed file extensions per binary kind (used to enforce MIME/extension consistency). */
const KIND_EXTENSIONS: Record<"pdf" | "docx" | "xlsx" | "pptx", string> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  pptx: "pptx",
};

function isOfficeMacro(filename: string | undefined): boolean {
  return /\.(docm|xlsm|pptm)$/i.test(filename ?? "");
}

function extensionOf(filename: string): string {
  return filename.split(".").at(-1)?.toLowerCase() ?? "";
}

/**
 * Client-supplied status values that are accepted on update. The lifecycle states
 * `expired`/`deleted`/`quarantined` are system-managed (set by expiry sweeps, deletion, and
 * moderation) and must not be assignable by a normal update, otherwise callers could revive
 * or relabel pages and bypass the expiry/moderation guarantees.
 */
const CLIENT_SETTABLE_STATUS: ReadonlySet<string> = new Set(["active", "unpublished"]);

function assertValidExpiry(expiresAt: string | null | undefined): void {
  if (expiresAt == null) return;
  if (Number.isNaN(Date.parse(expiresAt))) {
    throw new PageValidationError("invalid_request", "expires_at must be a valid ISO timestamp");
  }
}

function toResponse(page: SharedPage, publicBaseUrl: string): PageResponse {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    description: page.description,
    kind: page.kind,
    url: `${publicBaseUrl.replace(/\/$/, "")}/p/${page.slug}`,
    visibility: page.visibility,
    status: page.status,
    expires_at: page.expiresAt,
    created_at: page.createdAt,
    updated_at: page.updatedAt,
    version: page.version,
  };
}

async function toPublicResponse(
  storage: PageStorage,
  page: SharedPage,
  publicBaseUrl: string,
): Promise<PublicPageResponse> {
  return {
    ...toResponse(page, publicBaseUrl),
    content: await storage.readText(page.originalObjectKey ?? page.renderedObjectKey),
    filename: page.originalObjectKey?.split("/").at(-1) ?? null,
    mime_type: page.mimeType,
    size_bytes: page.sizeBytes,
  };
}

function parseExpiresIn(req: CreatePageRequest): ExpiresIn | null {
  if (req.expires_in) return req.expires_in;
  if (req.ttl_hours != null) return { value: req.ttl_hours, unit: "hours" };
  return null;
}

function expiry(
  now: number,
  expiresIn: ExpiresIn | null,
): {
  expiresAt: string | null;
  value: number | null;
  unit: "hours" | "days" | null;
} {
  if (!expiresIn) return { expiresAt: null, value: null, unit: null };
  if (!Number.isInteger(expiresIn.value) || expiresIn.value <= 0) {
    throw new PageValidationError("invalid_request", "expires_in.value must be a positive integer");
  }
  if (expiresIn.unit !== "hours" && expiresIn.unit !== "days") {
    throw new PageValidationError("invalid_request", "expires_in.unit must be hours or days");
  }
  const ms = expiresIn.value * (expiresIn.unit === "hours" ? 60 * 60_000 : 24 * 60 * 60_000);
  return {
    expiresAt: new Date(now + ms).toISOString(),
    value: expiresIn.value,
    unit: expiresIn.unit,
  };
}

export class PageService {
  private readonly repo: PageRepository;
  private readonly storage: PageStorage;
  private readonly publicBaseUrl: string;
  private readonly clock: () => number;
  private readonly ids: () => string;
  private readonly slugs: () => string;

  constructor(deps: PageServiceDeps) {
    this.repo = deps.repo;
    this.storage = deps.storage;
    this.publicBaseUrl = deps.publicBaseUrl ?? "http://localhost:5173";
    this.clock = deps.clock ?? (() => Date.now());
    this.ids = deps.ids ?? (() => randomUUID());
    this.slugs = deps.slugs ?? (() => randomBytes(16).toString("base64url"));
  }

  private assertCreate(req: CreatePageRequest, content: string): void {
    if (!req.title.trim()) throw new PageValidationError("invalid_request", "title is required");
    if (!["html", "markdown", "pdf", "docx", "xlsx", "pptx"].includes(req.kind)) {
      throw new PageValidationError(
        "unsupported_artifact_type",
        `unsupported page kind: ${req.kind}`,
      );
    }
    if (isOfficeMacro(req.filename)) {
      throw new PageValidationError(
        "unsupported_artifact_type",
        "macro-enabled Office files are rejected",
      );
    }
    // For binary artifacts, require a filename and enforce extension/kind consistency so the
    // macro check above cannot be bypassed simply by omitting `filename` (§11.3).
    if (!TEXT_KINDS.has(req.kind)) {
      const expectedExt = KIND_EXTENSIONS[req.kind as keyof typeof KIND_EXTENSIONS];
      if (!req.filename) {
        throw new PageValidationError(
          "invalid_request",
          `filename is required for ${req.kind} artifacts`,
        );
      }
      if (extensionOf(req.filename) !== expectedExt) {
        throw new PageValidationError(
          "unsupported_artifact_type",
          `filename extension does not match kind ${req.kind}`,
        );
      }
    }
    const size = bytes(content);
    const max = req.kind === "html" || req.kind === "markdown" ? MAX_TEXT_BYTES : MAX_FILE_BYTES;
    if (size > max)
      throw new PageValidationError("artifact_too_large", "artifact exceeds size limit");
    if (!content && (req.kind === "html" || req.kind === "markdown")) {
      throw new PageValidationError("invalid_artifact", "content is required");
    }
  }

  async createPage(ctx: PageRequestContext, req: CreatePageRequest): Promise<PageResponse> {
    const now = this.clock();
    const nowIso = new Date(now).toISOString();
    const content = decodeContent(req.content, req.content_base64);
    this.assertCreate(req, content);
    const id = `pg_${this.ids()}`;
    const slug = this.slugs();
    const prefix = `pages/${ctx.tenantId}/${id}`;
    const originalKey = `${prefix}/original.${req.kind}`;
    const exp = expiry(now, parseExpiresIn(req));

    const page: SharedPage = {
      id,
      tenantId: ctx.tenantId,
      ownerId: ctx.ownerId,
      slug,
      title: req.title,
      description: req.description ?? null,
      kind: req.kind,
      visibility: req.visibility ?? "unlisted",
      status: "active",
      source: req.source ?? "api",
      originalObjectKey: originalKey,
      renderedObjectKey: originalKey,
      assetPrefix: prefix,
      contentSha256: sha256(content),
      sizeBytes: bytes(content),
      mimeType: mimeFor(req.kind),
      createdAt: nowIso,
      updatedAt: nowIso,
      expiresAt: exp.expiresAt,
      expiresInValue: exp.value,
      expiresInUnit: exp.unit,
      lastViewedAt: null,
      viewCount: 0,
      version: 1,
    };
    const version: SharedPageVersion = {
      id: `pgv_${this.ids()}`,
      pageId: id,
      version: 1,
      originalObjectKey: originalKey,
      renderedObjectKey: originalKey,
      assetPrefix: prefix,
      contentSha256: page.contentSha256,
      sizeBytes: page.sizeBytes,
      mimeType: page.mimeType,
      renderStatus: "active",
      renderError: null,
      createdAt: nowIso,
    };

    await this.storage.writeText(originalKey, content);
    await this.repo.insert(page, version);
    return toResponse(page, this.publicBaseUrl);
  }

  async listPages(ctx: PageRequestContext, limit = 20): Promise<PageListResponse> {
    const pages = await this.repo.list(ctx.tenantId, ctx.ownerId, limit);
    return { items: pages.map((p) => toResponse(p, this.publicBaseUrl)), next_cursor: null };
  }

  async getPage(ctx: PageRequestContext, id: string): Promise<PageResponse> {
    const page = await this.repo.getById(ctx.tenantId, id);
    if (!page || page.ownerId !== ctx.ownerId) throw new PageNotFoundError(id);
    return toResponse(page, this.publicBaseUrl);
  }

  async updatePage(
    ctx: PageRequestContext,
    id: string,
    req: UpdatePageRequest,
  ): Promise<PageResponse> {
    const page = await this.repo.getById(ctx.tenantId, id);
    if (!page || page.ownerId !== ctx.ownerId) throw new PageNotFoundError(id);
    assertValidExpiry(req.expires_at);
    if (req.status !== undefined && !CLIENT_SETTABLE_STATUS.has(req.status)) {
      throw new PageValidationError(
        "invalid_request",
        `status ${req.status} cannot be set directly`,
      );
    }
    const nowIso = new Date(this.clock()).toISOString();
    const next: SharedPage = {
      ...page,
      title: req.title ?? page.title,
      description: req.description === undefined ? page.description : req.description,
      visibility: req.visibility ?? page.visibility,
      expiresAt: req.expires_at === undefined ? page.expiresAt : req.expires_at,
      status: req.status ?? page.status,
      updatedAt: nowIso,
    };
    return toResponse(await this.repo.update(next, req.version), this.publicBaseUrl);
  }

  async createVersion(
    ctx: PageRequestContext,
    id: string,
    req: CreatePageVersionRequest,
  ): Promise<PageResponse> {
    const page = await this.repo.getById(ctx.tenantId, id);
    if (!page || page.ownerId !== ctx.ownerId) throw new PageNotFoundError(id);
    const content = decodeContent(req.content, req.content_base64);
    this.assertCreate(
      { title: page.title, kind: page.kind, content, filename: req.filename },
      content,
    );
    const nowIso = new Date(this.clock()).toISOString();
    const nextVersion = page.version + 1;
    const prefix = page.assetPrefix ?? `pages/${ctx.tenantId}/${id}`;
    const originalKey = `${prefix}/original-v${nextVersion}.${page.kind}`;
    const next: SharedPage = {
      ...page,
      originalObjectKey: originalKey,
      renderedObjectKey: originalKey,
      contentSha256: sha256(content),
      sizeBytes: bytes(content),
      updatedAt: nowIso,
      status: "active",
    };
    const version: SharedPageVersion = {
      id: `pgv_${this.ids()}`,
      pageId: id,
      version: nextVersion,
      originalObjectKey: originalKey,
      renderedObjectKey: originalKey,
      assetPrefix: prefix,
      contentSha256: next.contentSha256,
      sizeBytes: next.sizeBytes,
      mimeType: next.mimeType,
      renderStatus: "active",
      renderError: null,
      createdAt: nowIso,
    };
    await this.storage.writeText(originalKey, content);
    return toResponse(
      await this.repo.insertVersion(next, version, req.version),
      this.publicBaseUrl,
    );
  }

  async unpublishPage(ctx: PageRequestContext, id: string): Promise<boolean> {
    const page = await this.repo.getById(ctx.tenantId, id);
    if (!page || page.ownerId !== ctx.ownerId) return false;
    const nowIso = new Date(this.clock()).toISOString();
    await this.repo.markStatus(id, "unpublished", nowIso);
    if (page.assetPrefix) await this.storage.deletePrefix(page.assetPrefix);
    return true;
  }

  async getPublicPage(slug: string, ctx?: PageRequestContext): Promise<PublicPageResponse> {
    const page = await this.repo.getBySlug(slug);
    if (!page) throw new PageNotFoundError(slug);
    const now = this.clock();
    if (page.expiresAt) {
      const expiresAt = Date.parse(page.expiresAt);
      // A malformed timestamp (NaN) is treated as expired rather than never-expiring, so a
      // bad stored value fails closed. Asset cleanup is deferred to sweepExpired() so this
      // unauthenticated public read never triggers a filesystem deletion.
      if (Number.isNaN(expiresAt) || expiresAt <= now) {
        await this.repo.markStatus(page.id, "expired", new Date(now).toISOString());
        throw new PageNotFoundError(slug);
      }
    }
    if (page.status !== "active") throw new PageNotFoundError(slug);
    if (page.visibility === "private") {
      if (!ctx || ctx.tenantId !== page.tenantId || ctx.ownerId !== page.ownerId) {
        throw new PageAccessError("private page requires owner authentication");
      }
    }
    await this.repo.incrementView(page.id, new Date(now).toISOString());
    return toPublicResponse(this.storage, page, this.publicBaseUrl);
  }

  async sweepExpired(): Promise<number> {
    const nowIso = new Date(this.clock()).toISOString();
    const expired = await this.repo.listExpired(nowIso);
    for (const page of expired) {
      await this.repo.markStatus(page.id, "expired", nowIso);
      if (page.assetPrefix) await this.storage.deletePrefix(page.assetPrefix);
    }
    return expired.length;
  }
}

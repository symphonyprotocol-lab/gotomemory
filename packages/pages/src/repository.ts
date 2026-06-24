import { PageNotFoundError, PageVersionConflictError } from "./errors.js";
import type { PageStatus, SharedPage, SharedPageVersion } from "./types.js";

function clonePage(page: SharedPage): SharedPage {
  return { ...page };
}

function cloneVersion(version: SharedPageVersion): SharedPageVersion {
  return { ...version };
}

export interface PageRepository {
  insert(page: SharedPage, version: SharedPageVersion): Promise<void>;
  getById(tenantId: string, id: string): Promise<SharedPage | null>;
  getBySlug(slug: string): Promise<SharedPage | null>;
  list(tenantId: string, ownerId: string, limit: number): Promise<SharedPage[]>;
  update(page: SharedPage, expectedVersion: number): Promise<SharedPage>;
  insertVersion(
    page: SharedPage,
    version: SharedPageVersion,
    expectedVersion: number,
  ): Promise<SharedPage>;
  markStatus(id: string, status: PageStatus, nowIso: string): Promise<boolean>;
  incrementView(id: string, nowIso: string): Promise<void>;
  listExpired(nowIso: string): Promise<SharedPage[]>;
}

export class InMemoryPageRepository implements PageRepository {
  private readonly pages = new Map<string, SharedPage>();
  private readonly slugs = new Map<string, string>();
  private readonly versions = new Map<string, SharedPageVersion[]>();

  insert(page: SharedPage, version: SharedPageVersion): Promise<void> {
    this.pages.set(page.id, clonePage(page));
    this.slugs.set(page.slug, page.id);
    this.versions.set(page.id, [cloneVersion(version)]);
    return Promise.resolve();
  }

  getById(tenantId: string, id: string): Promise<SharedPage | null> {
    const page = this.pages.get(id);
    if (!page || page.tenantId !== tenantId) return Promise.resolve(null);
    return Promise.resolve(clonePage(page));
  }

  getBySlug(slug: string): Promise<SharedPage | null> {
    const id = this.slugs.get(slug);
    const page = id ? this.pages.get(id) : undefined;
    return Promise.resolve(page ? clonePage(page) : null);
  }

  list(tenantId: string, ownerId: string, limit: number): Promise<SharedPage[]> {
    const items = [...this.pages.values()]
      .filter((p) => p.tenantId === tenantId && p.ownerId === ownerId && p.status !== "deleted")
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit)
      .map(clonePage);
    return Promise.resolve(items);
  }

  update(page: SharedPage, expectedVersion: number): Promise<SharedPage> {
    const existing = this.pages.get(page.id);
    if (!existing) return Promise.reject(new PageNotFoundError(page.id));
    if (existing.version !== expectedVersion) {
      return Promise.reject(new PageVersionConflictError(expectedVersion, existing.version));
    }
    const next = { ...clonePage(page), version: existing.version + 1 };
    this.pages.set(next.id, next);
    return Promise.resolve(clonePage(next));
  }

  insertVersion(
    page: SharedPage,
    version: SharedPageVersion,
    expectedVersion: number,
  ): Promise<SharedPage> {
    const existing = this.pages.get(page.id);
    if (!existing) return Promise.reject(new PageNotFoundError(page.id));
    if (existing.version !== expectedVersion) {
      return Promise.reject(new PageVersionConflictError(expectedVersion, existing.version));
    }
    const next = { ...clonePage(page), version: existing.version + 1 };
    this.pages.set(next.id, next);
    this.versions.set(page.id, [...(this.versions.get(page.id) ?? []), cloneVersion(version)]);
    return Promise.resolve(clonePage(next));
  }

  markStatus(id: string, status: PageStatus, nowIso: string): Promise<boolean> {
    const existing = this.pages.get(id);
    if (!existing) return Promise.resolve(false);
    this.pages.set(id, { ...existing, status, updatedAt: nowIso });
    return Promise.resolve(true);
  }

  incrementView(id: string, nowIso: string): Promise<void> {
    const existing = this.pages.get(id);
    if (!existing) return Promise.resolve();
    this.pages.set(id, {
      ...existing,
      lastViewedAt: nowIso,
      viewCount: existing.viewCount + 1,
    });
    return Promise.resolve();
  }

  listExpired(nowIso: string): Promise<SharedPage[]> {
    const now = Date.parse(nowIso);
    const items = [...this.pages.values()]
      .filter(
        (p) =>
          p.status === "active" &&
          p.expiresAt != null &&
          Number.isFinite(Date.parse(p.expiresAt)) &&
          Date.parse(p.expiresAt) <= now,
      )
      .map(clonePage);
    return Promise.resolve(items);
  }
}

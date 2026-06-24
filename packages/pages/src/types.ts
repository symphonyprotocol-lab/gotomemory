export type PageKind = "html" | "markdown" | "pdf" | "docx" | "xlsx" | "pptx";
export type PageVisibility = "private" | "unlisted" | "public";
export type PageStatus = "active" | "unpublished" | "expired" | "deleted" | "quarantined";
export type PageSource = "api" | "mcp" | "cli" | "console" | "agent" | "import";
export type ExpiryUnit = "hours" | "days";

export interface PageRequestContext {
  tenantId: string;
  ownerId: string;
  subjectId: string;
  clientId?: string;
}

export interface ExpiresIn {
  value: number;
  unit: ExpiryUnit;
}

export interface CreatePageRequest {
  title: string;
  kind: PageKind;
  content?: string;
  content_base64?: string;
  filename?: string;
  description?: string;
  visibility?: PageVisibility;
  expires_in?: ExpiresIn;
  ttl_hours?: number;
  source?: PageSource;
}

export interface UpdatePageRequest {
  title?: string;
  description?: string | null;
  visibility?: PageVisibility;
  expires_at?: string | null;
  status?: PageStatus;
  version: number;
}

export interface CreatePageVersionRequest {
  content?: string;
  content_base64?: string;
  filename?: string;
  version: number;
}

export interface SharedPage {
  id: string;
  tenantId: string;
  ownerId: string;
  slug: string;
  title: string;
  description: string | null;
  kind: PageKind;
  visibility: PageVisibility;
  status: PageStatus;
  source: PageSource;
  originalObjectKey: string | null;
  renderedObjectKey: string;
  assetPrefix: string | null;
  contentSha256: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  expiresInValue: number | null;
  expiresInUnit: ExpiryUnit | null;
  lastViewedAt: string | null;
  viewCount: number;
  version: number;
}

export interface SharedPageVersion {
  id: string;
  pageId: string;
  version: number;
  originalObjectKey: string | null;
  renderedObjectKey: string;
  assetPrefix: string | null;
  contentSha256: string;
  sizeBytes: number;
  mimeType: string;
  renderStatus: "pending" | "active" | "failed" | "quarantined";
  renderError: string | null;
  createdAt: string;
}

export interface PageResponse {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  kind: PageKind;
  url: string;
  visibility: PageVisibility;
  status: PageStatus;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface PageListResponse {
  items: PageResponse[];
  next_cursor: string | null;
}

export interface PublicPageResponse extends PageResponse {
  content: string;
  filename: string | null;
  mime_type: string;
  size_bytes: number;
}

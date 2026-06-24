// Public type surface for @gotomemory/contracts.
//
// Types are generated from openapi/openapi.yaml — never edit generated/ by hand.
// Run `pnpm --filter @gotomemory/contracts codegen` after changing the OpenAPI doc;
// CI verifies the regenerated output matches what is committed (monorepo-guide §6).
export type { paths, components, operations } from "../generated/openapi.js";

import type { components } from "../generated/openapi.js";

type Schemas = components["schemas"];

// Convenience aliases for the most-used schemas.
export type Sensitivity = Schemas["Sensitivity"];
export type EmbeddingPolicy = Schemas["EmbeddingPolicy"];
export type Freshness = Schemas["Freshness"];
export type MemoryStatus = Schemas["MemoryStatus"];
export type MemoryType = Schemas["MemoryType"];
export type Scope = Schemas["Scope"];
export type Source = Schemas["Source"];
export type Platform = Schemas["Platform"];
export type AuthProvider = Schemas["AuthProvider"];

export type AuthLoginRequest = Schemas["AuthLoginRequest"];
export type AuthLoginResponse = Schemas["AuthLoginResponse"];
export type AuthMeResponse = Schemas["AuthMeResponse"];
export type AuthUser = Schemas["AuthUser"];
export type CreateMemoryRequest = Schemas["CreateMemoryRequest"];
export type CreateMemoryResponse = Schemas["CreateMemoryResponse"];
export type SearchRequest = Schemas["SearchRequest"];
export type SearchResponse = Schemas["SearchResponse"];
export type SearchResultItem = Schemas["SearchResultItem"];
export type MemoryRead = Schemas["MemoryRead"];
export type UpdateMemoryRequest = Schemas["UpdateMemoryRequest"];
export type ContextBuildRequest = Schemas["ContextBuildRequest"];
export type ContextBuildResponse = Schemas["ContextBuildResponse"];
export type ContextConfirmRequest = Schemas["ContextConfirmRequest"];
export type CreatePageRequest = Schemas["CreatePageRequest"];
export type UpdatePageRequest = Schemas["UpdatePageRequest"];
export type CreatePageVersionRequest = Schemas["CreatePageVersionRequest"];
export type PageResponse = Schemas["PageResponse"];
export type PageListResponse = Schemas["PageListResponse"];
export type PublicPageResponse = Schemas["PublicPageResponse"];
export type PolicyDecision = Schemas["PolicyDecision"];
export type Confirmation = Schemas["Confirmation"];
export type OmittedMemory = Schemas["OmittedMemory"];
export type ApiError = Schemas["Error"];

/** Sensitivity levels in ascending order — the ordering relied on by §8.3. */
export const SENSITIVITY_ORDER = ["public", "normal", "private", "secret"] as const;

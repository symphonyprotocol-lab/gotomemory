# gotomemory MVP Implementation Checklist

> Source specs: `specs/monorepo-architecture.md`, `specs/memory-sharing-system.md`.
> `specs/share-pages-system.md` is retained only as a cancellation note.
>
> Rule for this checklist: every shipped feature point must have automated test coverage in the same package or app.

## Foundation

- [x] Create monorepo package layout from the architecture spec.
  - Implemented in `apps/*`, `packages/*`, `tooling/`.
  - Covered by `pnpm run boundaries`.
- [x] Add shared TS, ESLint, and Prettier config package.
  - Implemented in `packages/config-ts`.
  - Covered by root `pnpm run lint` and `pnpm run format:check`.
- [x] Add dependency boundary rules.
  - Implemented in `tooling/dependency-cruiser.cjs`.
  - Covered by `pnpm run boundaries`.

## Contracts

- [x] Define shared memory, context, and export types.
  - Implemented in `packages/contracts/generated/types.ts`.
  - Covered by `packages/contracts/src/validation.test.ts`.
- [x] Define OpenAPI and JSON Schema source locations for future code generation.
  - Implemented in `packages/contracts/openapi/*` and `packages/contracts/schemas/*`.
  - Covered by `packages/contracts/scripts/codegen.ts`.
- [ ] Remove legacy share-link API client/types from contracts.
  - Share links are no longer part of the product.
  - Legacy implementation still exists and should be cleaned up separately.

## Local Memory

- [x] Add platform-agnostic memory store interface and in-memory implementation.
  - Implemented in `packages/store/src/index.ts`.
  - Covered by `packages/store/src/index.test.ts`.
- [x] Add local keyword retrieval fallback.
  - Implemented in `packages/retrieval/src/index.ts`.
  - Covered by `packages/retrieval/src/index.test.ts`.
- [x] Add save, search, context, update, delete, pause, and resume operations.
  - Implemented in `packages/core/src/index.ts`.
  - Covered by `packages/core/src/index.test.ts`.
- [x] Split context into ready and private-confirmation buckets.
  - Implemented in `packages/core/src/index.ts`.
  - Covered by `packages/core/src/index.test.ts`.
- [x] Format authorized memory prompt with prompt-injection framing.
  - Implemented in `packages/core/src/index.ts`.
  - Covered by `packages/core/src/index.test.ts`.

## Render And Export

- [x] Add conversation renderer and sanitizer for local previews/exports.
  - Implemented in `packages/render/src/index.ts`.
  - Covered by `packages/render/src/index.test.ts`.
- [x] Add local Markdown, TXT, Obsidian Markdown, JSON, and minimal PDF export.
  - Implemented in `packages/export/src/index.ts`.
  - Covered by `packages/export/src/index.test.ts`.

## Browser Extension

- [x] Add exact host permissions for ChatGPT, Claude, and Gemini only.
  - Implemented in `apps/extension/src/manifest.ts` and `apps/extension/wxt.config.ts`.
  - Covered by `apps/extension/src/manifest.test.ts`.
- [x] Add three site adapters for message extraction, prompt insertion, and UI mount discovery.
  - Implemented in `packages/site-adapters/src/index.ts`.
  - Covered by `packages/site-adapters/src/index.test.ts`.
- [x] Add typed content-to-background messaging for save, context, pause, and resume.
  - Implemented in `apps/extension/src/messaging.ts` and `apps/extension/src/handlers.ts`.
  - Covered by `apps/extension/src/messaging.test.ts`.
- [x] Add WXT entrypoint scaffold for background and three content scripts.
  - Implemented in `apps/extension/entrypoints/*`.
  - Covered by TypeScript build/typecheck.

## Web App

- [x] Add Vite/React app shell.
  - Implemented in `apps/web`.
  - Covered by `apps/web/src/App.test.tsx`.
- [x] Add route for `/`.
  - Implemented in `apps/web/src/routes.ts`.
  - Covered by `apps/web/src/routes.test.ts`.
- [x] Add Web homepage explaining the extension-first product.
  - Implemented in `apps/web/src/App.tsx`.
  - Covered by `apps/web/src/App.test.tsx`.
- [x] Remove share-link pages from the Web app.
  - Enforced by routing every path to the homepage.
  - Covered by `apps/web/src/routes.test.ts` and `apps/web/src/App.test.tsx`.

## Legacy Share Server

- [ ] Remove legacy share-server package or move it behind an archived feature flag.
  - Implemented in `apps/share-server/src/index.ts`.
  - No longer part of the current product spec.

## Deferred By Spec

- [x] Persistent IndexedDB/chrome.storage implementation for production extension storage.
  - Implemented in `packages/store/src/persistent.ts`.
  - Covered by `packages/store/src/persistent.test.ts`.
- [x] Browser embedding model and semantic retrieval enhancement.
  - Implemented in `packages/retrieval/src/index.ts`.
  - Covered by `packages/retrieval/src/index.test.ts`.
- [x] Full PDF/Word fidelity pipeline beyond the minimal local PDF export.
  - Implemented in `packages/export/src/index.ts` with printable HTML, paged local PDF, and OOXML `.docx`.
  - Covered by `packages/export/src/index.test.ts`.
- [ ] Remove legacy Postgres/object-storage repository for share-server.
  - Implemented in `apps/share-server/src/repository.ts`.
  - No longer part of the current product spec.
- [x] Cross-device encrypted sync.
  - Implemented in `packages/sync/src/index.ts`.
  - Covered by `packages/sync/src/index.test.ts`.
- [x] Developer/MCP/CLI/Python SDK advanced layer.
  - Implemented in `packages/sdk-ts`, `apps/cli`, `apps/mcp-server`, and `py/sdk`.
  - Covered by `packages/sdk-ts/src/index.test.ts`, `apps/cli/src/index.test.ts`, `apps/mcp-server/src/index.test.ts`, and `py/tests/test_sdk.py`.

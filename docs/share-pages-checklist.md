# Share Pages Implementation Checklist

## Branch

- [x] Create implementation branch `codex/share-pages`.

## Spec And Planning

- [x] Add share pages product/architecture spec.
- [x] Link share pages spec from README.
- [x] Update monorepo guide with unified `apps/console` and `packages/pages`.

## Domain Package

- [x] Add `@gotomemory/pages` package.
- [x] Define shared page types and request/response contracts.
- [x] Implement in-memory page repository.
- [x] Implement filesystem page storage for local/dev use.
- [x] Implement HTML sanitizer for read-only pages.
- [x] Implement Markdown rendering into sanitized HTML.
- [x] Implement PDF/Office read-only wrappers or safe placeholders.
- [x] Implement expiration calculation in hours/days.
- [x] Implement expiration cleanup and access denial after expiry.
- [x] Add unit tests for sanitizer, rendering, expiration, and repository behavior.

## Gateway API

- [x] Wire PageService into the Gateway runtime.
- [x] Add authenticated management routes under `/v1/pages`.
- [x] Add public page data route `/v1/pages/public/:slug`; render `/p/:slug` in Web Console.
- [x] Add page metadata, list, update, version, and unpublish routes.
- [x] Add unified error mapping for page errors.
- [x] Add Gateway tests for publish, view, expiry, and unpublish.

## Contracts, SDK, CLI

- [x] Extend OpenAPI with page schemas and routes.
- [x] Regenerate TypeScript contract types.
- [x] Extend TypeScript SDK with pages client methods.
- [x] Extend CLI with `gotomemory pages ...` commands.
- [x] Add tests for SDK/CLI page flows.

## MCP Tools And Prompts

- [x] Add page sharing handlers.
- [x] Add semantic MCP tools: `share_generated_page`, `share_html_page`, `share_markdown_page`, `share_pdf_page`, `share_word_document`, `share_excel_workbook`, `share_powerpoint_deck`.
- [x] Add management tools: `list_shared_pages`, `get_shared_page`, `unpublish_shared_page`, `update_shared_page_metadata`.
- [x] Add MCP prompts for page sharing.
- [x] Add MCP handler tests.

## Web Apps

- [x] Integrate product entry, Pages management, and `/p/:slug` read-only display into `apps/console`.
- [x] Add routes for home, Pages intro, open-by-slug, and shared page display.
- [x] Keep shared content display isolated and read-only.

## Verification

- [x] Run focused page package tests.
- [x] Run Gateway tests.
- [x] Run MCP tests.
- [x] Run CLI tests.
- [x] Run typecheck for affected packages.
- [x] Run repository-level checks where feasible.

# gotomemory

**Your AI memory, everywhere.** Tell one assistant, and ChatGPT, Claude, and Gemini all
remember — plus one-click conversation export. Built for ordinary
users: simple to use, near-zero learning curve.

**Local-first.** Memory and export run entirely on your machine — offline, no login, nothing
uploaded by default. Optional cross-device sync is the only planned feature that needs a
server and an account.

## Specs

The specs are **consumer-first**: the simple, easy-to-use product is the MVP, and the
enterprise-grade governance (policy engine, audit, multi-tenancy, fine-grained sensitivity)
is deferred to a clearly-marked "后续高级层 / advanced layer" section in each spec.

- [System spec](specs/memory-sharing-system.md) — cross-assistant memory for everyday users
  (browser-extension-first), plus one-click conversation export (Markdown/PDF/Obsidian/Notion…).
  Share links are not a product feature.
- [Monorepo architecture spec](specs/monorepo-architecture.md) — the engineering skeleton the
  product specs map onto: package layout, dependency boundaries, the shared contract, the
  local-first execution model, and the build/test/release pipeline.

## Status

The consumer-first MVP scaffold is now in place:

- `packages/contracts` defines the shared memory contract, schemas, OpenAPI placeholders,
  validation helpers, and a lightweight client.
- `packages/core`, `store`, and `retrieval` implement local-first memory save/search/context,
  private confirmation, pause/resume, update/delete, and keyword fallback retrieval.
- `packages/render` and `export` implement sanitized rendering plus local
  Markdown/TXT/Obsidian/JSON/minimal-PDF export.
- `packages/site-adapters` and `apps/extension` scaffold the three browser-extension surfaces
  for ChatGPT, Claude, and Gemini.
- `apps/web` scaffolds the Web homepage.
- Advanced/developer layers now include encrypted sync (`packages/sync`), TypeScript SDK
  (`packages/sdk-ts`), CLI (`apps/cli`), MCP JSON-RPC handlers (`apps/mcp-server`), and Python
  SDK (`py/sdk`).

The execution checklist lives in [docs/implementation-checklist.md](docs/implementation-checklist.md).

## Verify

Requires Node 22.x and pnpm 11.x (pinned via `packageManager`).

```bash
pnpm install
pnpm run check
pnpm run test
pnpm run build
pnpm run codegen
cd py && uv run pytest -q
```

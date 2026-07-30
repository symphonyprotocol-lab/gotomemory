# gotomemory

**The best way to export AI conversations — with cross-assistant memory built in.**
One-click export of ChatGPT, Claude, and Gemini conversations to Markdown, Obsidian,
Notion, and PDF. Along the way, save a preference once and every assistant remembers it.
Built for ordinary users: simple to use, near-zero learning curve.

**Positioning: export earns the install, memory earns the retention.** Export is the
high-frequency, proven need that the product leads with; cross-assistant memory ("your AI
memory, everywhere") is the retention core, surfaced after the first export and validated
against explicit metrics before deeper investment (spec §2.1, §5.0, §12.4).

**Local-first.** Memory and export run entirely on your machine — offline, no login, nothing
uploaded by default. Optional cross-device sync is the only planned feature that needs a
server and an account.

## Specs

The specs are **consumer-first**: the simple, easy-to-use product is the MVP, and the
enterprise-grade governance (policy engine, audit, multi-tenancy, fine-grained sensitivity)
is deferred to a clearly-marked "后续高级层 / advanced layer" section in each spec.

- [System spec](specs/memory-sharing-system.md) — one-click conversation export
  (Markdown/PDF/Obsidian/Notion…) as the acquisition hook, plus cross-assistant memory for
  everyday users (browser-extension-first) as the retention core, with a first-week cold-start
  design (§5.0) and validation gates (§12.4). Share links are not a product feature.
- [Monorepo architecture spec](specs/monorepo-architecture.md) — the engineering skeleton the
  product specs map onto: package layout, dependency boundaries, the shared contract, the
  local-first execution model, and the build/test/release pipeline.

## Status

The consumer-first MVP scaffold is now in place:

- `packages/contracts` defines the shared memory contract, schemas, OpenAPI placeholders,
  validation helpers, and a lightweight client.
- `packages/core`, `store`, and `retrieval` implement local-first memory save/search/context,
  private confirmation, pause/resume, update/delete, and keyword fallback retrieval.
- `packages/export` implements sanitized preview rendering plus local
  Markdown/TXT/Obsidian/JSON/docx/Notion export; PDF goes through printable HTML +
  the browser's print dialog.
- `packages/site-adapters` and `apps/extension` scaffold the three browser-extension surfaces
  for ChatGPT, Claude, and Gemini.
- `apps/web` scaffolds the Web homepage.
- Advanced/developer layers — encrypted sync (`packages/sync`), TypeScript SDK
  (`packages/sdk-ts`), CLI (`apps/cli`), MCP JSON-RPC handlers (`apps/mcp-server`), and Python
  SDK (`py/sdk`) — are implemented but **frozen** pending the §12.4 validation gate: no
  releases, no new features, CI demoted to nightly (monorepo spec §13).

The 2026-07 direction shift (export-first) is implemented: adapter survival (nightly live
smoke via `tooling/live-smoke` + signed remote selector overrides), first-week cold start
(first-run export guidance, memory templates, ChatGPT native-memory import, post-export save
suggestions), opt-in trust mode with visible undo, export fidelity (code/tables/math/images)
plus a Notion-blocks target, and local §12.4 validation counters (aggregate-only,
user-switchable). Still open: the two-week §12.4 user validation itself, and release ops
(production selector-signing key, smoke-test session secrets).

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

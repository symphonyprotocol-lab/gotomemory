# gotomemory

**Your AI memory, everywhere.** Tell one assistant, and ChatGPT, Claude, and Gemini all
remember — plus one-click read-only sharing for whatever they generate. Built for ordinary
users: simple to use, near-zero learning curve.

## Specs

The specs are **consumer-first**: the simple, easy-to-use product is the MVP, and the
enterprise-grade governance (policy engine, audit, multi-tenancy, fine-grained sensitivity)
is deferred to a clearly-marked "后续高级层 / advanced layer" section in each spec.

- [System spec](specs/memory-sharing-system.md) — cross-assistant memory for everyday users.
- [Share pages spec](specs/share-pages-system.md) — paste/upload → read-only share link
  (HTML, Markdown, PDF; Office to follow).

## Status

**Clean slate.** The previous enterprise-grade implementation has been cleared so the
product can be rebuilt from the simplified, consumer-first specs above. What remains is the
monorepo scaffolding (root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`,
`turbo.json`, ESLint config) and the two specs.

## Next

Rebuild from the specs, with the browser extension as the P0 surface (it is what ordinary
users actually touch), backed by a minimal cloud store and a small set of memory + pages
endpoints. See the MVP scope in each spec.

Requires Node 22.x and pnpm 11.x (pinned via `packageManager`).

# gotomemory

Cross-platform **Memory Control Plane** — governs how user memories are authorized,
audited, and injected into ChatGPT, Claude, and Gemini contexts.

## Specs

- [System spec](specs/memory-sharing-system.md) — what the system does.
- [Monorepo guide](specs/monorepo-guide.md) — how the code is organized.
- [Overview](specs/overview.html) — static visual overview.

## Layout

```
apps/
  gateway/       Memory Gateway API (Fastify) over the orchestrator
  cli/           gotomemory CLI / skill substrate (commander)
  mcp-server/    MCP server exposing governed memory tools
packages/
  contracts/     OpenAPI + generated types — single source of truth
  core/          Memory Orchestrator (classify, retrieve, policy filter, refresh)
  policy/        deterministic Memory Policy evaluation
  crypto/        AES-256-GCM envelope encryption + redaction
  db/            repository interface + in-memory impl + SQL migration
  audit/         append-only audit sink with a hash chain
  adapters/      ChatGPT/Claude/Gemini payload strategies + manifests
  sdk-ts/        TypeScript SDK (openapi-fetch)
  config-ts/     shared ESLint + Prettier presets
py/sdk/          Python SDK (uv workspace, httpx)
infra/           docker-compose, IaC (planned)
```

Per [monorepo-guide](specs/monorepo-guide.md) §5.2, dependency boundaries map the security
model onto packages — e.g. adapters/SDK/CLI can never reach storage or crypto. This is
enforced in CI by `pnpm boundaries`.

## Status

The MVP system is implemented and tested end-to-end: create → search (preview-only) →
read → `context/build` + confirm, with deterministic policy, envelope encryption, refresh,
and audit. 50 TS tests + Python SDK tests pass. The browser **console** and **extension**
(spec milestones M4/M5) are intentionally not built yet.

## Develop

```bash
corepack enable          # use the pinned pnpm
pnpm install
pnpm check               # format:check + lint + typecheck + boundaries
pnpm -r test             # or: pnpm exec turbo run test
pnpm py:install && pnpm py:test   # Python SDK
```

## Run it

```bash
pnpm exec turbo run build
PORT=8787 node apps/gateway/dist/index.js &          # start the gateway

export GOTOMEMORY_URL=http://localhost:8787/v1 GOTOMEMORY_TOKEN=t1:u1
echo "prefers TypeScript" | node apps/cli/dist/bin.js memory create --type preference --json
node apps/cli/dist/bin.js memory search typescript --json
node apps/cli/dist/bin.js context build --task "write code" --json
```

Requires Node 22.x, pnpm 11.x (pinned via `packageManager`), and uv for the Python SDK.

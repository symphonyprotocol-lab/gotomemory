# gotomemory

Cross-platform **Memory Control Plane** — governs how user memories are authorized,
audited, and injected into ChatGPT, Claude, and Gemini contexts.

## Specs

- [System spec](specs/memory-sharing-system.md) — what the system does.
- [Monorepo guide](specs/monorepo-guide.md) — how the code is organized.
- [Overview](specs/overview.html) — static visual overview.

## Layout

```
apps/        deployable units (gateway, mcp-server, cli, console, extension)
packages/    internal libraries (contracts, core, policy, adapters, db, crypto,
             audit, sdk-ts, config-ts, testing); only sdk-ts/cli are published
py/          Python workspace (uv) — Python SDK
infra/       docker-compose, IaC, migration runner
tooling/     repo-level scripts and lint config
specs/       specification documents
```

See [monorepo-guide](specs/monorepo-guide.md) §5 for the dependency-boundary rules
that map the security model onto package boundaries.

## Develop

```bash
corepack enable          # use the pinned pnpm
pnpm install
pnpm check               # format:check + lint + typecheck + boundaries
```

Requires Node 22.x and pnpm 11.x (pinned via `packageManager`).

# @gotomemory/contracts

The single source of truth for the gotomemory API (system spec §9) and data model (§8).

- `openapi/openapi.yaml` — authored by hand; the contract.
- `generated/openapi.ts` — `openapi-typescript` output; **committed, never hand-edited**.
- `src/index.ts` — public type surface (re-exports + convenience aliases).

```bash
pnpm --filter @gotomemory/contracts codegen   # regenerate after editing the YAML
pnpm --filter @gotomemory/contracts build
```

CI verifies the regenerated output matches what is committed (monorepo-guide §6), so a
stale `generated/` fails the build. Privacy constraints are encoded in the schema:
`SearchResultItem` has no `content`, and `PolicyDecision`/`Error` never carry bodies.

Downstream: `@gotomemory/sdk` (TS) and the Python SDK generate their clients from the
same `openapi.yaml`. Per monorepo-guide §5.2, `contracts` is a leaf — it depends on no
other internal package.

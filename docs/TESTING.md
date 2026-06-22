# End-to-End Testing

This guide covers **end-to-end (E2E) testing** of gotomemory: booting a real gateway and
driving the governed memory flows through the CLI and raw HTTP. It verifies the product
behaviors — not just units — that system spec §19.1 calls "must-win".

> For unit/integration tests (Vitest per package, Python SDK), see
> [the test scripts](#relationship-to-the-automated-test-suite) at the bottom.

---

## What "E2E" means here

- A live **Memory Gateway** (Fastify) running over the **in-memory dev backend**
  (`InMemoryMemoryRepository` + `InMemoryAuditSink`). **No database required.**
- Requests driven through the real **CLI** (`apps/cli`) and raw **HTTP** (`curl`), exactly
  as a client would — so auth, validation, policy, encryption, and audit all execute.
- State is in-memory: every gateway restart is a clean slate.

```
 CLI / curl ──HTTP──▶ Gateway ──▶ MemoryService ──▶ policy ─ crypto ─ in-memory repo ─ audit
                       (auth, schema validation)      (deny-by-default governance)
```

---

## Prerequisites

| Tool    | Version           | Notes               |
| ------- | ----------------- | ------------------- |
| Node.js | 22.x (`.nvmrc`)   | runtime             |
| pnpm    | 11.x (`corepack`) | `corepack enable`   |
| curl    | any               | raw HTTP assertions |

```bash
corepack enable
pnpm install
```

No build step is needed — the E2E script runs the gateway and CLI from source via `tsx`.

---

## One-click: `scripts/e2e-demo.sh`

Runs the full suite end to end and prints a `PASS/FAIL` summary.

```bash
./scripts/e2e-demo.sh             # default port 8799
PORT=8901 ./scripts/e2e-demo.sh   # override the gateway port
```

It boots the gateway on a dedicated port, waits for `/health`, runs every scenario below
with assertions, and **always tears the gateway down on exit** (even on failure). It exits
`0` when all checks pass and non-zero otherwise, so it is safe to wire into CI.

Expected tail:

```
== Summary ==
  29 passed, 0 failed
All end-to-end checks passed.
```

### What it asserts

| Scenario             | Behavior verified (spec)                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1. Normal preference | create → search (preview only, no `content`) → read (needs `purpose`) → auto-inject                                        |
| 2. Private memory    | `embedding_policy=redacted_only`; build returns `requires_confirmation`; confirm injects; token is one-time                |
| 3. Secret governance | `credential_hint` → `secret`, `embedding_policy=disabled`; absent from search; `omitted` with `sensitivity_exceeds_policy` |
| 4. Update            | re-classification floor (cannot downgrade a detected secret); optimistic lock → `409`                                      |
| 5. Error model       | missing field → `400`; no creds → `401` (auth precedes validation); bad enum → `400`; CLI `not_found` exit code `5`        |
| 6. Tenant isolation  | tenant `t1` cannot see tenant `t2` memories                                                                                |
| 7. Soft delete       | `DELETE` → `204`; deleted memory no longer returned by search                                                              |

---

## Manual walkthrough

Use this when you want to poke the system by hand instead of running the script.

### 1. Start the gateway

```bash
# from source (no build):
PORT=8787 npx tsx apps/gateway/src/index.ts &

# or the production artifact:
pnpm exec turbo run build
PORT=8787 node apps/gateway/dist/index.js &

curl -s localhost:8787/health        # => {"status":"ok"}
```

Point the CLI at it. **The dev token is `tenant:subject`** — `Bearer t1:u1` resolves to
tenant `t1`, subject `u1`:

```bash
export GOTOMEMORY_URL=http://localhost:8787/v1
export GOTOMEMORY_TOKEN=t1:u1
cli() { npx tsx apps/cli/src/bin.ts "$@"; }   # or: node apps/cli/dist/bin.js
```

> For a stable encryption key across restarts, set `GOTOMEMORY_MASTER_KEY` to a base64
> 32-byte value before starting the gateway; otherwise a random key is generated per boot.

### 2. Normal preference — cross-platform context

```bash
echo "用户希望代码示例优先使用 TypeScript" | cli memory create --type preference --tags coding,ts --json
cli memory search typescript --json          # preview only; never returns `content`
cli memory read <id> --purpose debugging --json
cli context build --task "写代码" --platform claude --json
```

### 3. Private memory — confirm before inject

```bash
echo "我负责公司内部支付系统" | cli memory create --type fact --sensitivity private --json
cli context build --task "支付系统" --platform claude --json   # requires_confirmation: true
# take decision_id + confirmation.confirmation_token + confirmation.preview[0].id, then:
cli context confirm --decision-id <dec> --confirmation-token <cnf> --ids <memId> --json
```

Note the flag is `--confirmation-token`, distinct from the global bearer `--token`.

### 4. Secret — omitted by default

```bash
echo "prod db 密码见 vault" | cli memory create --type credential_hint --json   # → secret
cli memory search db --json            # secret absent
cli context build --task "db" --json   # secret in `omitted` (sensitivity_exceeds_policy)
```

### 5. Error model (raw HTTP)

```bash
# missing required field → 400 invalid_request
curl -s -X POST localhost:8787/v1/memories -H 'authorization: Bearer t1:u1' \
  -H 'content-type: application/json' -d '{"scope":"personal","type":"preference"}'

# no credentials (even with a bad body) → 401 — auth runs before validation
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:8787/v1/memories -d '{}'
```

Stop the gateway when done: `kill %1` (or `pkill -f "gateway/src/index.ts"`).

---

## Reference

### HTTP status ↔ error code ↔ CLI exit code

| HTTP        | `error.code`       | CLI exit |
| ----------- | ------------------ | -------- |
| 200/201/204 | —                  | 0        |
| 400         | `invalid_request`  | 2        |
| 401         | `unauthenticated`  | 3        |
| 403         | `policy_denied`    | 4        |
| 404         | `not_found`        | 5        |
| 409         | `version_conflict` | 6        |
| 429         | `rate_limited`     | 7        |
| 5xx         | `internal`         | 1        |

### CLI command summary

```
gotomemory [--base-url <url>] [--token <tenant:subject>] [--json] <command>

memory create  --type <t> [--scope personal] [--source user_explicit]
               [--sensitivity <s>] [--tags a,b] [--content <text>]   # else stdin
memory search  <query> [--platform <p>] [--scope a,b] [--limit 12]
memory read    <id> --purpose <why>
memory delete  <id>
context build  --task <t> [--platform claude] [--client-id cli] [--purpose <p>] [--token-budget 1200]
context confirm --decision-id <id> --confirmation-token <tok> --ids a,b
```

---

## Troubleshooting

| Symptom                        | Cause / fix                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------- |
| CLI connection refused         | Gateway not running, or wrong `GOTOMEMORY_URL` port. `curl /health`.          |
| Everything returns `401`       | `GOTOMEMORY_TOKEN` unset or not `tenant:subject` form.                        |
| Newly created memory not found | Gateway restarted (in-memory backend cleared), or different tenant/`--token`. |
| Port already in use            | Pass `PORT=...` and update `GOTOMEMORY_URL` to match.                         |
| Stale behavior from `dist/`    | Run from source via `tsx`, or rebuild: `pnpm exec turbo run build`.           |

---

## Relationship to the automated test suite

E2E is the outer layer. The inner layers run without a live server:

```bash
pnpm check        # format + lint + typecheck + dependency boundaries (security model)
pnpm test         # Vitest unit/integration across all TS packages
pnpm py:install && pnpm py:test   # Python SDK
```

The gateway's own integration tests (`apps/gateway/src/gateway.test.ts`) exercise the same
routes via Fastify's `inject()` without opening a socket; `scripts/e2e-demo.sh` complements
them by validating the full process over real HTTP.

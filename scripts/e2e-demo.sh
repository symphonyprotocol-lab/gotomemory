#!/usr/bin/env bash
#
# gotomemory — one-click end-to-end demo / smoke test.
#
# Boots the gateway (in-memory dev backend), then drives the governed memory
# flows through the CLI and raw HTTP, asserting the "must-win" behaviors from
# system spec §19.1: cross-platform context, private→confirm, secret omission,
# the unified error model, optimistic locking, and tenant isolation.
#
# Usage:
#   ./scripts/e2e-demo.sh            # run everything, print PASS/FAIL summary
#   PORT=8901 ./scripts/e2e-demo.sh  # use a different gateway port
#
# Exit code 0 = all assertions passed; non-zero = at least one failed (CI-friendly).
# No database required — the gateway uses the in-memory repository.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-8799}"
BASE="http://localhost:${PORT}"
export GOTOMEMORY_URL="${BASE}/v1"
export GOTOMEMORY_TOKEN="t1:u1"

# ---- pretty output (color only on a TTY) ----------------------------------
if [ -t 1 ]; then RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; DIM=$'\033[2m'; RST=$'\033[0m'
else RED=; GRN=; YEL=; DIM=; RST=; fi
PASS=0; FAIL=0
section() { printf "\n${YEL}== %s ==${RST}\n" "$1"; }
pass() { PASS=$((PASS + 1)); printf "  ${GRN}✓${RST} %s\n" "$1"; }
fail() { FAIL=$((FAIL + 1)); printf "  ${RED}✗ %s${RST}\n" "$1"; }
expect_eq() { [ "$1" = "$2" ] && pass "$3" || fail "$3 — expected '$2', got '$1'"; }
expect_contains() { case "$1" in *"$2"*) pass "$3" ;; *) fail "$3 — '$2' not found" ;; esac; }
expect_absent() { case "$1" in *"$2"*) fail "$3 — '$2' unexpectedly present" ;; *) pass "$3" ;; esac; }

# ---- run from source via tsx: always reflects current code, no build needed,
#      and avoids stale dist/ artifacts. (Production runs the built dist/.) -----
GW=(npx tsx apps/gateway/src/index.ts)
CLI_BIN=(npx tsx apps/cli/src/bin.ts)
cli() { "${CLI_BIN[@]}" "$@"; }

# ---- tiny JSON field extractor (dot path, supports numeric indices) --------
# usage: echo "$json" | jget confirmation.preview.0.id
jget() {
  node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      try { let o = JSON.parse(s);
        for (const k of process.argv[1].split(".")) o = o[/^\d+$/.test(k) ? +k : k];
        console.log(o == null ? "" : typeof o === "object" ? JSON.stringify(o) : o);
      } catch { console.log(""); }
    });' "$1"
}
http_code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

# ---- boot the gateway, ensure cleanup on exit -----------------------------
LOG="$(mktemp)"
section "Starting gateway on :${PORT}  ${DIM}(${GW[*]})${RST}"
PORT="$PORT" "${GW[@]}" >"$LOG" 2>&1 &
GW_PID=$!
cleanup() {
  local status=$?
  kill "$GW_PID" 2>/dev/null || true
  wait "$GW_PID" 2>/dev/null || true
  rm -f "$LOG"
  return "$status"
}
trap cleanup EXIT

for _ in $(seq 1 40); do
  curl -sf "${BASE}/health" >/dev/null 2>&1 && break
  if ! kill -0 "$GW_PID" 2>/dev/null; then
    echo "${RED}gateway process exited early:${RST}"; cat "$LOG"; exit 1
  fi
  sleep 0.4
done
if ! curl -sf "${BASE}/health" >/dev/null 2>&1; then
  echo "${RED}gateway did not become healthy on :${PORT}${RST}"; cat "$LOG"; exit 1
fi
expect_eq "$(curl -s "${BASE}/health" | jget status)" "ok" "GET /health → ok"

# ===========================================================================
section "Scenario 1 — normal preference: create → search → read → build"
NORMAL=$(echo "用户希望代码示例优先使用 TypeScript" |
  cli memory create --type preference --tags coding,ts --json)
NID=$(echo "$NORMAL" | jget id)
expect_eq "$(echo "$NORMAL" | jget sensitivity)" "normal" "create classifies as normal"
expect_eq "$(echo "$NORMAL" | jget embedding_policy)" "allowed" "embedding_policy = allowed"

SEARCH=$(cli memory search typescript --json)
expect_contains "$SEARCH" "$NID" "search surfaces the new memory"
expect_absent "$SEARCH" "\"content\"" "search never returns content"
expect_eq "$(echo "$SEARCH" | jget items.0.access.can_inject)" "true" "normal memory is injectable"

READ=$(cli memory read "$NID" --purpose debugging --json)
expect_contains "$READ" "TypeScript" "read returns full content (with purpose)"

BUILD1=$(cli context build --task "写代码" --platform claude --json)
expect_contains "$BUILD1" "$NID" "context/build auto-injects the normal memory"
expect_eq "$(echo "$BUILD1" | jget requires_confirmation)" "false" "no confirmation needed for normal"

# ===========================================================================
section "Scenario 2 — private memory: requires confirmation, then inject"
PRIV=$(echo "我负责公司内部支付系统" |
  cli memory create --type fact --sensitivity private --tags payments --json)
PID=$(echo "$PRIV" | jget id)
expect_eq "$(echo "$PRIV" | jget embedding_policy)" "redacted_only" "private → embedding redacted_only"

BUILD2=$(cli context build --task "支付系统" --platform claude --json)
expect_eq "$(echo "$BUILD2" | jget requires_confirmation)" "true" "private build requires confirmation"
expect_contains "$BUILD2" "requires_confirmation" "private listed in omitted/confirmation"

DEC=$(echo "$BUILD2" | jget decision_id)
TOK=$(echo "$BUILD2" | jget confirmation.confirmation_token)
MID=$(echo "$BUILD2" | jget confirmation.preview.0.id)
CONFIRM=$(cli context confirm --decision-id "$DEC" --confirmation-token "$TOK" --ids "$MID" --json)
expect_contains "$CONFIRM" "$PID" "confirm injects the private memory"
expect_eq "$(echo "$CONFIRM" | jget requires_confirmation)" "false" "confirmed context needs no further confirmation"

REUSE=$(http_code -X POST "${BASE}/v1/context/confirm" \
  -H "authorization: Bearer ${GOTOMEMORY_TOKEN}" -H 'content-type: application/json' \
  -d "{\"decision_id\":\"${DEC}\",\"confirmation_token\":\"${TOK}\",\"confirmed_memory_ids\":[\"${MID}\"]}")
expect_eq "$REUSE" "404" "confirmation token is one-time (reuse → 404)"

# ===========================================================================
section "Scenario 3 — secret governance: omitted by default"
SECRET=$(echo "prod db 密码见 vault" | cli memory create --type credential_hint --json)
SID=$(echo "$SECRET" | jget id)
expect_eq "$(echo "$SECRET" | jget sensitivity)" "secret" "credential_hint forces secret"
expect_eq "$(echo "$SECRET" | jget embedding_policy)" "disabled" "secret → embedding disabled"

SSEARCH=$(cli memory search db --json)
expect_absent "$SSEARCH" "$SID" "secret never appears in search"

BUILD3=$(cli context build --task "db" --json)
expect_contains "$BUILD3" "sensitivity_exceeds_policy" "secret omitted with reason"
expect_contains "$BUILD3" "$SID" "secret id listed in omitted"

# ===========================================================================
section "Scenario 4 — update: re-classify floor + optimistic lock"
# downgrade attempt on a credential_hint stays secret
UPD=$(curl -s -X PATCH "${BASE}/v1/memories/${SID}" \
  -H "authorization: Bearer ${GOTOMEMORY_TOKEN}" -H 'content-type: application/json' \
  -d '{"sensitivity":"public","version":1}')
expect_eq "$(echo "$UPD" | jget sensitivity)" "secret" "update cannot downgrade detected secret"
# stale version → 409
STALE=$(http_code -X PATCH "${BASE}/v1/memories/${SID}" \
  -H "authorization: Bearer ${GOTOMEMORY_TOKEN}" -H 'content-type: application/json' \
  -d '{"tags":["x"],"version":1}')
expect_eq "$STALE" "409" "stale version → 409 version_conflict"

# ===========================================================================
section "Scenario 5 — unified error model"
expect_eq "$(http_code -X POST "${BASE}/v1/memories" \
  -H "authorization: Bearer ${GOTOMEMORY_TOKEN}" -H 'content-type: application/json' \
  -d '{"scope":"personal","type":"preference"}')" "400" "missing required field → 400"
expect_eq "$(http_code -X POST "${BASE}/v1/memories" -H 'content-type: application/json' -d '{}')" \
  "401" "no credentials → 401 (auth precedes validation)"
expect_eq "$(http_code -X POST "${BASE}/v1/memories" \
  -H "authorization: Bearer ${GOTOMEMORY_TOKEN}" -H 'content-type: application/json' \
  -d '{"scope":"nope","type":"preference","content":"x","source":"api"}')" "400" "bad enum → 400"
cli memory read does-not-exist --purpose x >/dev/null 2>&1
expect_eq "$?" "5" "CLI not_found exit code = 5"

# ===========================================================================
section "Scenario 6 — tenant isolation"
echo "t2 私有内容" | cli --token t2:u1 memory create --type note --json >/dev/null
T1=$(cli --token t1:u1 memory search "私有内容" --json)
expect_absent "$T1" "t2 私有内容" "tenant t1 cannot see tenant t2 memories"

# ===========================================================================
section "Scenario 7 — soft delete removes from retrieval"
expect_eq "$(http_code -X DELETE "${BASE}/v1/memories/${NID}" \
  -H "authorization: Bearer ${GOTOMEMORY_TOKEN}")" "204" "DELETE → 204"
AFTER=$(cli memory search typescript --json)
expect_absent "$AFTER" "$NID" "deleted memory no longer returned by search"

# ===========================================================================
section "Scenario 8 — shared page: frontend URL + gateway JSON data"
PAGE=$(echo '<h1 onclick="bad()">Share</h1><script>alert(1)</script>' |
  cli pages publish --title "Share smoke" --kind html --expires 2h --json)
PGID=$(echo "$PAGE" | jget id)
PURL=$(echo "$PAGE" | jget url)
PSLUG=$(echo "$PAGE" | jget slug)
expect_contains "$PURL" "http://localhost:5173/p/" "share URL points to the Web Console frontend"
PUBLIC=$(curl -s "${BASE}/v1/pages/public/${PSLUG}")
expect_eq "$(echo "$PUBLIC" | jget kind)" "html" "public page data returns artifact metadata"
expect_contains "$PUBLIC" "<script>" "gateway returns raw artifact data, not rendered HTML"
expect_eq "$(http_code -X DELETE "${BASE}/v1/pages/${PGID}" \
  -H "authorization: Bearer ${GOTOMEMORY_TOKEN}")" "204" "shared page unpublish → 204"
expect_eq "$(http_code "${BASE}/v1/pages/public/${PSLUG}")" "404" "unpublished shared page data → 404"

# ===========================================================================
printf "\n${YEL}== Summary ==${RST}\n"
printf "  ${GRN}%d passed${RST}, " "$PASS"
if [ "$FAIL" -gt 0 ]; then printf "${RED}%d failed${RST}\n" "$FAIL"; exit 1; fi
printf "0 failed\n${GRN}All end-to-end checks passed.${RST}\n"

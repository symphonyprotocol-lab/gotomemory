# gotomemory MVP Implementation Checklist

> Source specs: `specs/monorepo-architecture.md`, `specs/memory-sharing-system.md`.
> Share links are not a product feature; the share spec, share-server, and share contracts
> have been removed.
>
> Rule for this checklist: every shipped feature point must have automated test coverage in the same package or app.

## Direction Shift (2026-07): Export-First, Validate Memory

> From the positioning review: export is the acquisition hook, memory is the retention core,
> and the cross-assistant-memory habit is an unvalidated hypothesis with explicit decision
> thresholds. Spec anchors: memory-sharing-system §2.1 / §5.0 / §6.1 (trust mode) / §12.4;
> monorepo-architecture §7 (remote selectors) / §11 (live smoke) / §13 (freeze).

### Adapter survival (engineering lifeline — highest priority)

- [x] Daily live smoke test: Playwright against real chatgpt.com / claude.ai /
      gemini.google.com probing composer + mount selectors, failing loudly (platform +
      selector) on selector breakage; login/bot walls classify as warnings. (monorepo §11)
  - Implemented in `tooling/live-smoke` (`@gotomemory/live-smoke`) and
    `.github/workflows/live-smoke.yml` (nightly cron + dispatch, report artifact).
  - Covered by `tooling/live-smoke/src/index.test.ts` (classification core, no browser).
- [x] Exercise `messageSelector` on a real conversation page
      (`GOTOMEMORY_SMOKE_CONVERSATION_URL_*` + storage state), and escalate permanent
      blindness: a platform that stays bot/login-blocked for 3 consecutive nightly runs
      fails the job instead of warning forever (streak state cached across CI runs).
  - Implemented in `tooling/live-smoke/src/live-smoke.ts` (conversation probe),
    `src/streak.ts` (pure streak/alert logic), and the cache steps in
    `.github/workflows/live-smoke.yml`.
  - Covered by `tooling/live-smoke/src/index.test.ts` (messageSelector classification +
    streak update/alert/parse).
  - _Still open (ops, not code): provision the storage-state and conversation-URL
    secrets so chatgpt.com / claude.ai are actually judged — the committed report shows
    they have been bot-blocked so far._
- [x] Selector-signing ops toolchain: P-256 keypair generation and config signing CLIs,
      WebCrypto end-to-end so the raw `r‖s` signature format matches what the extension
      verifies (openssl/DER would fail silently); refuses to sign documents outside the
      allowlist; release runbook included.
  - Implemented in `tooling/selector-signing` (`keygen` / `sign` scripts + README).
  - Covered by `tooling/selector-signing/src/signing.test.ts` (round-trip through the
    extension's real `verifySignedSelectorOverrides`, tamper/wrong-key rejection).
  - Production key generated and wired into `apps/extension/src/selector-config.ts`;
    the private half stays offline (git-ignored, never in the repo).
  - _Still open (ops): stand up config.gotomemory.dev with a published document when a
    platform redesign first requires one — an empty document cannot be signed, so there
    is nothing to publish until then._
- [x] Pre-merge CI: `.github/workflows/ci.yml` runs check + tests + build + real
      `wxt build` + store `zip` (artifact uploaded) on every push/PR — previously the
      only workflows were nightly.
- [x] Composer selectors are priority lists: the real composer anchor first
      (`#prompt-textarea` / `.ProseMirror` / `rich-textarea`), generic
      editable/textarea as fallback; insertion/undo/topic-read resolve the first
      _visible_ match per alternative in order (`findComposer`), so stray editables and
      login pages can't hijack injection.
  - Implemented in `packages/site-adapters/src/index.ts`; covered by
    `src/index.test.ts` ("prefers the platform composer", invalid-alternative
    resilience).
- [x] Storage hardening: `MemoryStore.createMany` batches a whole-conversation save
      into one blob write (was one full-blob rewrite per message), the manifest
      requests `unlimitedStorage`, and quota failures surface an actionable panel
      message instead of a generic retry.
  - Implemented in `packages/store` (+`persistent.ts`), `packages/core` (`saveMany`),
    `apps/extension/src/manifest.ts` / `wxt.config.ts`, `mount.ts`
    (`saveFailureMessage`).
  - Covered by `packages/store/src/persistent.test.ts` ("single blob write"),
    `apps/extension/src/manifest.test.ts`, and `mount.test.ts` (quota message).
- [x] Storage concurrency: every store mutation was an unserialized read-blob →
      mutate → write-blob, so overlapping calls read the same pre-state and the last
      write silently dropped the others (three concurrent saves persisted one). Two
      assistant tabs, or auto-capture racing a manual "save all", lost memories while
      the panel reported success. All transactions — reads included, since a stale read
      feeds the `saveMany` dedup index — now run through a serializing queue, and
      `KeyValueStore` gained an atomic `update()` for settings/metrics.
  - Implemented in `packages/store/src/persistent.ts` (`#transaction`) and
    `apps/extension/src/kv.ts` (`QueuedKeyValueStore`).
  - Covered by `packages/store/src/persistent.test.ts` (concurrent creates, queue
    survives a rejected transaction).
- [x] Conversation-scoped dedup no longer lists and deep-clones the whole library on
      every save — auto-capture paid that cost per message, growing without bound under
      `unlimitedStorage`. `MemoryStore.listByConversation` reads only the conversations
      involved; `removeMany` deletes a whole conversation in one blob write.
  - Implemented in `packages/store` (`listByConversation`, `removeMany`) and
    `packages/core/src/index.ts` (`save`/`saveMany`/`removeMany`).
  - Covered by `packages/store/src/persistent.test.ts` and
    `packages/core/src/index.test.ts`.
- [x] Remote selector overrides: built-in defaults + signed selector-only JSON config fetched
      by background; selector strings only, never code. (monorepo §7)
  - Implemented in `packages/site-adapters/src/overrides.ts` (sanitize/verify/apply, ECDSA
    P-256), `apps/extension/src/selector-config.ts` (fetch/verify/persist against the
    production public key), background refresh on service-worker start, and
    content-script application in `apps/extension/src/mount.ts`.
  - Covered by `packages/site-adapters/src/overrides.test.ts`, `src/index.test.ts`, and
    `apps/extension/src/messaging.test.ts` / `mount.test.ts`.
- [x] Selector-config replay guard + fetch backoff: a signature does not stop a
      correctly-signed _older_ document from rolling selectors back to a broken set, so
      the payload now carries a signed `version` and extensions refuse anything below
      the highest they have accepted. Fetches back off to one per 6 hours (immediate on
      a fresh install) instead of one per service-worker start, which MV3 triggers
      constantly. `sign` requires `--version`.
  - Implemented in `packages/site-adapters/src/overrides.ts`
    (`VerifiedSelectorOverrides`), `apps/extension/src/selector-config.ts`, and
    `tooling/selector-signing` (+ README runbook).
  - Covered by `packages/site-adapters/src/overrides.test.ts` (version carried),
    `apps/extension/src/messaging.test.ts` (replay refused, newer accepted, backoff),
    `tooling/selector-signing/src/signing.test.ts`.

### Positioning and first-week cold start

- [x] Rewrite `apps/web` homepage copy to the export-first narrative. (spec §2.1)
  - Implemented in `apps/web/src/App.tsx`; covered by `apps/web/src/App.test.tsx`
    (asserts export headline precedes the memory tagline).
- [x] First-run onboarding: guide one export right after install. (spec §5.0)
  - Implemented in `apps/extension/src/mount.ts` (status guidance until the first successful
    export flips `onboarded`); covered by `apps/extension/src/mount.test.ts`.
- [x] Memory templates: 5–8 one-click starter memories, editable/deletable like any memory.
      (spec §5.0)
  - Implemented in `packages/core/src/templates.ts` + a "添加常用记忆模板" action in the
    settings drawer of `mount.ts` (idempotent re-apply); covered by
    `packages/core/src/templates.test.ts` and `mount.test.ts`.
- [x] Panel redesign: collapse secondary controls (templates + toggles) behind a settings
      gear so the resting panel is just export / save-all / inject / view; make the post-export
      suggestion and the inject-undo mutually exclusive and self-clearing on the next action;
      disambiguate labels ("保存这 N 条" vs "保存整段对话").
  - Implemented in `apps/extension/src/mount.ts`; covered by `mount.test.ts`
    ("settings drawer", "transient exclusivity").
- [x] ~~Import from the ChatGPT native memory page, `source: import`.~~ **Dropped** during the
      panel redesign — the manage-memories DOM scrape was low-confidence and cluttered the
      panel; templates already cover cold-start seeding. The `import` source value stays in the
      contract for future re-introduction.
- [x] Post-export save suggestion: "this conversation has N memorable preferences — save?"
      (spec §2.1)
  - Implemented in `packages/core/src/templates.ts` (`suggestMemorableLines`) + suggest box
    in `mount.ts`; covered by `templates.test.ts` and `mount.test.ts`.
- [x] Trust mode (opt-in): auto-inject non-private memories with a visible
      "已自动带入 N 条（可撤销）" affordance; private confirmation unchanged. (spec §6.1)
  - Implemented in `mount.ts` (settings-driven auto-inject + verbatim-block undo via
    `SiteAdapter.removeFromPrompt`); covered by `mount.test.ts` and
    `site-adapters/src/index.test.ts`.
- [x] Private memories are actually markable, so the confirm-before-inject rule guards
      something. Nothing could ever set `is_private`, which left `needs_confirm`
      permanently empty and the §5.3/§10 privacy promise (and the homepage claim)
      unimplemented. The memory library now has a per-memory privacy toggle, and
      injection surfaces private matches in an explicit confirmation box rather than
      dropping them — in trust mode too, which still never auto-inserts them.
  - Implemented in `apps/extension/src/library.ts` (toggle via `memory.update`),
    `mount.ts` (`InjectResult.pending`, `insertMemories`, confirm box), `panel-view.ts`.
  - Covered by `mount.test.ts` (gate holds private back then inserts on confirm; trust
    mode never auto-inserts; toggle writes `is_private`).
- [x] Memory library ordering: the store lists newest-first, so a conversation replayed
      backwards and the level-1 "last message" preview showed the thread's _first_ line.
      Groups are now sorted chronologically before rendering.
  - Implemented in `apps/extension/src/library.ts` (`byChronology`); covered by
    `mount.test.ts` ("renders a conversation oldest-first").
- [x] Destructive-action guard: deleting a conversation had no confirmation and issued
      one full-blob rewrite per memory (leaving a half-deleted group if one failed). It
      now confirms once and deletes via a single `removeMany`.
  - Implemented in `apps/extension/src/library.ts` (`deleteGroup`); covered by
    `mount.test.ts` (declining is a no-op, confirming batches).

### Export fidelity (now ahead of all advanced-layer work)

- [x] Fidelity pass for code blocks / tables / math / images across MD, Obsidian, and the
      printable-HTML/PDF path. (spec §12.1)
  - Implemented in `packages/export/src/blocks.ts` + export-local printable renderer;
    covered by `packages/export/src/index.test.ts` (regressions per content kind, hostile
    input included).
- [x] Structure-preserving capture: the sites render Markdown to HTML, so `textContent`
      alone loses every fence/pipe/TeX marker and absorbs "Copy code"-style chrome —
      messages are now serialized DOM→Markdown at extraction time (code fences with
      language, pipe tables, KaTeX `annotation` → `$…$`/`$$…$$`, images/links/lists,
      chrome stripped), which is what makes the fidelity pass above fire on real pages.
  - Implemented in `packages/site-adapters/src/dom-markdown.ts`, wired in
    `src/index.ts` (`toMessage`, with `textContent` as the never-lose-a-message
    fallback).
  - Covered by `packages/site-adapters/src/dom-markdown.test.ts` (rendered ChatGPT /
    Claude / Gemini structures end-to-end through `extractMessages`).
- [x] PDF export goes through printable HTML + the browser's print dialog ("另存为
      PDF") — real pagination and CJK fonts. The hand-rolled single-page PDF byte-writer
      (42-line truncation, mojibake CJK) is deleted; `"pdf"` is no longer an
      `ExportFormat`.
  - Implemented in `apps/extension/src/mount.ts` (`pdf-print` option + `openPrintView`)
    and `packages/export/src/index.ts` (format removed).
  - Covered by `apps/extension/src/mount.test.ts` (print flow + popup-blocked warning)
    and `packages/export/src/index.test.ts` (CJK printable regression).
- [x] Notion export target (P1 in spec §6.2): pure conversation → Notion block-JSON
      conversion (`.notion.json` download; OAuth push to a user's workspace is future work).
  - Implemented in `packages/export/src/notion.ts` (+ `"notion"` in `ExportFormat`, panel
    format option); covered by `packages/export/src/notion.test.ts`.

### Validation gate (spec §12.4)

- [x] Local, privacy-preserving counters: injects per week, export → first-memory conversion,
      day-14 retention; user-visible and switchable, aggregate counts only.
  - Implemented in `packages/core/src/metrics.ts` (pure state/summary), background counting +
    `metrics.*`/`settings.*` messages in `apps/extension/src/handlers.ts`, panel switch in
    `mount.ts`; covered by `packages/core/src/metrics.test.ts` and
    `apps/extension/src/messaging.test.ts` (incl. "aggregates contain no content" and
    "switch off stops counting").
- [ ] Two-week run with 20–30 real multi-assistant users; decide per the §12.4 thresholds
      (≥3 injects/week → deepen memory; 1–3 → lead with trust mode, retest; <1 → memory
      becomes a feature of the export product). _Manual field work — cannot be closed from
      the repo; instrumentation above is ready._

### Advanced layer freeze (monorepo §13)

- [x] Demote `packages/sync`, `packages/sdk-ts`, `apps/cli`, `apps/mcp-server`, and `py/sdk`
      from the required CI matrix to a nightly job; stop changeset releases for them; note the
      freeze in each package README.
  - Implemented in root `package.json` (`--filter=!` on default build/lint/typecheck/test +
    `*:frozen` scripts), `.changeset/config.json` (`ignore`), freeze notices in the five
    package READMEs, and `.github/workflows/frozen-nightly.yml`.
  - Covered by the turbo task matrix itself: `pnpm run test` excludes the four TS packages;
    `pnpm run test:frozen` runs exactly them (verified green).

### Structural cleanup (2026-07)

- [x] Folded the `render` micro-package into `packages/export/src/preview.ts` (export was
      its only consumer); deleted the `ui` package (zero consumers — the panel/library UI
      lives in the extension); removed the `apps/share-server` build remnants; split the
      1,500-line `apps/extension/src/mount.ts` into `mount.ts` (behavior),
      `panel-view.ts` (static style/markup), and `library.ts` (memory-library rendering).
  - Covered by the existing suites (moved, not rewritten): `apps/extension/src/mount.test.ts`
    — public APIs unchanged at the time.
- [x] Dead-code sweep: removed the `export` preview renderer (superseded by the
      printable-HTML path, and buggy — see "Render And Export"), the never-wired
      `SemanticRetrievalEngine`/`HashEmbeddingModel`/`cosineSimilarity` (they could not be
      wired as written: `Memory.embedding` is always null, so every search would embed
      every memory — slower _and_ worse than the keyword path; a real semantic ranker
      needs embeddings persisted at save time), `IndexedDbDriver` (the extension commits
      to `chrome.storage.local` + `unlimitedStorage`), `assertNever`, and
      `isSupportedPlatform`. `validateSaveMemoryRequest`/`validateConversationMessages`
      were the opposite case — dead but valuable, so they are now wired into the
      background message boundary instead.
  - Specs corrected to match (`monorepo-architecture.md` package table + §7,
    `memory-sharing-system.md` storage-selection bullet), which had described IndexedDB
    storage and cosine-similarity retrieval that the code does not do.
- [x] Capture and export correctness pass:
  - Auto-capture marked a message seen _before_ saving, so a failed save was never
    retried and a later success overwrote the error; it now marks on success and reports
    the failure. (`mount.ts`, covered by `mount.test.ts`)
  - Whole-history collection had per-phase guards worth ~5 minutes of hijacked scrolling
    on a page that never settles; it now has a 45s wall-clock ceiling. (`mount.ts`,
    covered by `mount.test.ts`)
  - `autoMount`'s observer ran a document-wide `querySelector` per mutation batch —
    continuously while an answer streams, and the panel is appended last so the lookup
    walks the whole conversation DOM. It now checks a cached node's `isConnected` behind
    a 500ms debounce. (`mount.ts`)
  - Export filenames stripped every non-ASCII character, so all CJK-titled conversations
    downloaded as `conversation.md`. Only filesystem-reserved characters are replaced now.
    (`packages/export/src/index.ts`, covered by `index.test.ts`)
- [x] Frozen-layer crypto fixes (`packages/sync`): base64 encoding spread the byte array
      into `String.fromCharCode` and overflowed the call stack past ~100KB — one long
      assistant answer; it now chunks. PBKDF2 went 100k → 600k iterations (OWASP's current
      floor for HMAC-SHA256), with `kdf_iterations` recorded per envelope so the cost can
      rise again without making existing envelopes undecryptable.
  - Covered by `packages/sync/src/index.test.ts` (400KB round-trip, legacy-cost envelope).
- [x] Background message boundary + metrics accuracy: inbound `memory.save`/`memory.saveMany`
      go through `validateSaveMemoryRequest`; a bulk save counts as N saves rather than 1;
      day-14 retention compares local calendar dates on both sides instead of mixing a local
      date string with a UTC instant; `deps.now` is threaded into the memory service; the
      local counters are finally rendered in the panel (`getMetrics` had no caller).
  - Implemented in `apps/extension/src/handlers.ts`, `packages/core/src/metrics.ts`,
    `apps/extension/src/mount.ts` / `panel-view.ts`.
  - Covered by `apps/extension/src/messaging.test.ts` and `packages/core/src/metrics.test.ts`.
- [x] Repo hygiene: `.prettierignore` now covers Playwright's `test-results/` /
      `playwright-report/` (git-ignored but still walked, so `pnpm run check` failed for
      anyone who had run the e2e suite), `pnpm run boundaries` cruises `tooling/` as well as
      `apps`/`packages`, `@gotomemory/sdk` re-exports core's `formatAuthorizedMemoryPrompt`
      instead of keeping a second hand-maintained copy of the prompt-injection framing, and
      `apps/web`'s `App` actually calls `resolveRoute` rather than ignoring its prop.

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
- [x] Remove legacy share-link API client/types from contracts.
  - Share types/schemas/OpenAPI removed; `generated/client.ts` now exposes the memory
    operations from `openapi/memory.yaml` (`/v1/memories`, `/v1/context`, pause/resume).
  - Covered by `packages/contracts/src/validation.test.ts` and `packages/sdk-ts/src/index.test.ts`.

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

- [x] ~~Conversation renderer and sanitizer for local previews/exports.~~ **Removed.**
      Folded from `packages/render` into `packages/export/src/preview.ts`, then deleted
      outright: the printable-HTML path (`toPrintableHtml`) covers every real consumer,
      and the leftover renderer had a latent bug (code blocks were restored with a string
      replacement, so `$&` and friends inside code expanded into the placeholder).
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
- [x] Add typed content-to-background messaging for save, search, context, update, delete, pause, and resume.
  - Implemented in `apps/extension/src/messaging.ts` and `apps/extension/src/handlers.ts`.
  - Covered by `apps/extension/src/messaging.test.ts`.
- [x] Wire background to persistent chrome.storage so memories survive service-worker eviction.
  - Implemented in `apps/extension/entrypoints/background.ts` via `PersistentJsonMemoryStore` + `ChromeStorageDriver`.
  - Covered by `apps/extension/src/messaging.test.ts` ("persists memories across service-worker restarts").
- [x] Wire content scripts to capture the latest message and inject prompt-wrapped context.
  - Implemented in `apps/extension/src/mount.ts`.
  - Covered by `apps/extension/src/mount.test.ts`.
- [x] Add WXT entrypoint scaffold for background and three content scripts.
  - Implemented in `apps/extension/entrypoints/*`.
  - Covered by TypeScript build/typecheck.
- [x] Real-browser E2E: `wxt build` the production bundle, load it into Chromium
      (persistent context + `--load-extension`), and drive panel mount → export download
      (fence fidelity asserted on the file) → save-all through the background worker →
      cross-conversation inject into a contenteditable composer (the execCommand path
      jsdom cannot run) → undo. Caught a real bug on first run: rich-text undo failed
      because inserted newlines vanish from `textContent` (fixed in
      `packages/site-adapters` with whitespace-insensitive range deletion).
  - Implemented in `tooling/extension-e2e` (`prepare.ts` patches only the E2E copy's
    matches to include the local fixture origin; the production bundle is untouched).
  - Run with `pnpm --filter @gotomemory/extension-e2e run e2e` (needs Playwright
    Chromium). Not part of the default turbo `test` task.

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

- [x] Remove legacy share-server package.
  - `apps/share-server` deleted along with its repository, dev server, and tests.

## Deferred By Spec

- [x] Persistent IndexedDB/chrome.storage implementation for production extension storage.
  - Implemented in `packages/store/src/persistent.ts`.
  - Covered by `packages/store/src/persistent.test.ts`.
- [x] Browser embedding model and semantic retrieval enhancement.
  - Implemented in `packages/retrieval/src/index.ts`.
  - Covered by `packages/retrieval/src/index.test.ts`.
- [x] PDF/Word beyond plain text: printable HTML (print-to-PDF) and OOXML `.docx`.
  - Implemented in `packages/export/src/index.ts`. The former "paged local PDF"
    byte-writer was removed (it was single-page, 42-line-truncated, CJK-broken); PDF is
    now the printable-HTML + browser-print path wired in the extension panel.
  - Covered by `packages/export/src/index.test.ts`.
- [x] Remove legacy Postgres/object-storage repository for share-server.
  - Deleted with `apps/share-server`.
- [x] Cross-device encrypted sync.
  - Implemented in `packages/sync/src/index.ts`.
  - Covered by `packages/sync/src/index.test.ts`.
- [x] Developer/MCP/CLI/Python SDK advanced layer.
  - Implemented in `packages/sdk-ts`, `apps/cli`, `apps/mcp-server`, and `py/sdk`.
  - Covered by `packages/sdk-ts/src/index.test.ts`, `apps/cli/src/index.test.ts`, `apps/mcp-server/src/index.test.ts`, and `py/tests/test_sdk.py`.

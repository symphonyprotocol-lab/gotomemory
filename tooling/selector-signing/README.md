# @gotomemory/selector-signing

Ops tooling for the remote selector-override channel (monorepo spec §7): the
extension hot-fixes broken CSS selectors by fetching a **signed,
selector-strings-only** JSON — this package generates the keypair and signs the
documents.

**Why WebCrypto only:** the extension verifies with `SubtleCrypto.verify`,
which expects the raw `r‖s` ECDSA signature encoding. openssl emits DER and
fails verification _silently_. Both CLIs here sign via WebCrypto, so the two
ends stay byte-compatible by construction (locked by `signing.test.ts`, which
verifies through the extension's real `verifySignedSelectorOverrides`).

## Release runbook

1. **Generate the production keypair (once):**

   ```bash
   pnpm --filter @gotomemory/selector-signing run keygen
   ```

   - Move `selector-signing-key.json` (private key, git-ignored, chmod 600)
     into the team secret store; delete the local copy.
   - Paste the printed `SELECTOR_OVERRIDES_PUBLIC_KEY` constant into
     [`apps/extension/src/selector-config.ts`](../../apps/extension/src/selector-config.ts),
     replacing the placeholder.

2. **When a platform redesign breaks a selector**, write the fix as plain JSON
   (allowlist: `chatgpt`/`claude`/`gemini` × `messageSelector`/`inputSelector`/
   `mountSelector`; `inputSelector` alternatives are a priority list, see
   `packages/site-adapters/src/index.ts`):

   ```json
   { "chatgpt": { "messageSelector": "[data-new-turn-attr]" } }
   ```

3. **Sign it, bumping `--version` above the last published document:**

   ```bash
   pnpm --filter @gotomemory/selector-signing run sign -- \
     --key /path/to/selector-signing-key.json \
     --in overrides.json --version 2 --out selector-overrides.v1.json
   ```

   The version is signed alongside the selectors, and extensions **refuse any
   document older than the newest one they have already accepted**. Signatures
   alone do not stop replay: anyone able to answer the config request (a hostile
   network, a stale CDN edge) could otherwise serve a correctly-signed _older_
   document and roll selectors back to a known-broken set. Keep the last
   published version number with the key in the secret store — reusing or
   lowering it ships a config that installed extensions will silently ignore.

4. **Publish** `selector-overrides.v1.json` at
   `https://config.gotomemory.dev/selector-overrides.v1.json` with
   `content-type: application/json` and CORS `Access-Control-Allow-Origin: *`
   (the MV3 background fetch requires it). Extensions re-check at most every
   6 hours (and on the first start after install), so a hot-fix reaches users
   within that window; everything fails open to built-in selectors.

**Key rotation:** shipping a new public key requires an extension release; the
old key keeps verifying for users on older versions, so keep signing with the
old key until the release has saturated, then switch.

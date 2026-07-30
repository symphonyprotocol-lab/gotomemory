---
"@gotomemory/extension": minor
---

Wire the production verification key into the selector-override channel.

`SELECTOR_OVERRIDES_PUBLIC_KEY` was the `PLACEHOLDER-REPLACE-AT-RELEASE` string, which fails every signature. Since the channel is designed to fail open — an unverifiable document means "keep the built-in selectors" — it looked healthy while being incapable of ever delivering a hot-fix. The real P-256 public half now ships; the private half stays offline and git-ignored.

Verified before committing that the pasted key actually matches the generated private key, by signing a document with the private half and checking it through the extension's own `verifySignedSelectorOverrides`, plus confirming a tampered payload is rejected. Worth doing precisely because a mistyped coordinate would have been silent.

A test now asserts the key is a real unpadded-base64url P-256 public key and carries no private `d` component — CI cannot check the pair itself, since the private half is deliberately not available to it.

Also corrects two claims in the docs that no longer hold, and one that never did: the key is no longer a placeholder, and an "empty bootstrap document" cannot be published at all — the signing tool rejects `{}`. A 404 on the document path is therefore the steady state rather than a gap: there is nothing to override until a site's DOM actually changes.

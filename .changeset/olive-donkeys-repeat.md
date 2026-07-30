---
"@gotomemory/site-adapters": minor
"@gotomemory/extension": minor
"@gotomemory/retrieval": minor
"@gotomemory/contracts": major
"@gotomemory/export": minor
"@gotomemory/store": minor
"@gotomemory/core": minor
---

Fix memory loss under concurrent writes, implement the private-memory gate, and harden the selector-override channel.

**Data loss (the important one).** Every mutation in `PersistentJsonMemoryStore` was a read-blob → mutate → write-blob with no serialization, so two overlapping calls both read the same pre-state and the second write silently discarded the first one's memory. Three concurrent saves persisted one. This is reachable in normal use — the MV3 background handles each `runtime.sendMessage` independently, so two open assistant tabs, or auto-capture racing a manual "save all", dropped memories while the UI reported success. All store transactions (reads included) now run through a serializing queue, and `KeyValueStore` gained an atomic `update()` that settings and metrics use.

**Private memories were never actually private.** Nothing could set `is_private`, so `needs_confirm` was always empty and the documented confirm-before-inject rule guarded nothing. The memory library now has a per-memory privacy toggle, and injection surfaces private matches in an explicit confirmation box instead of dropping them — including in trust mode, which still never auto-inserts them.

**Selector-override replay.** Signatures alone did not prevent a correctly-signed _older_ config from rolling selectors back to a broken set. The signed payload now carries a `version`, extensions refuse anything below the highest they have accepted, and config fetches back off to at most one per 6 hours instead of one per service-worker start. `sign` requires `--version`; see the selector-signing README.

Also fixed:

- Conversations rendered newest-first, so a thread replayed backwards and the "last message" preview showed the first one. Groups are now ordered chronologically.
- `autoMount`'s observer ran a document-wide `querySelector` on every mutation batch, i.e. continuously while an answer streamed. It now checks a cached node and debounces.
- Whole-history collection could hijack scrolling for ~5 minutes; it now has a 45s ceiling.
- Auto-capture marked a message seen _before_ saving it, so a failed save was never retried, and a later success overwrote the error message.
- Deleting a conversation had no confirmation and issued one full-blob rewrite per memory; it now confirms once and deletes in a single `removeMany` transaction.
- Conversation-scoped dedup listed and deep-cloned the entire library on every save; it now reads only the conversation involved.
- Export filenames stripped all non-ASCII, so every CJK-titled conversation downloaded as `conversation.md`.
- Sync: base64 encoding overflowed the call stack past ~100KB (one long answer), and PBKDF2 went from 100k to 600k iterations, with the count recorded per envelope so existing envelopes still decrypt.
- Inbound background messages are validated with `validateSaveMemoryRequest`; a bulk save now counts as N saves rather than 1; day-14 retention compares like-for-like local dates; local metrics are finally shown in the panel.

Removed as unreachable: the `preview` renderer in `export` — superseded by the printable-HTML path, and carrying its own latent bug (code blocks were restored with a string replacement, so `$&` and friends inside code expanded into the placeholder); the unwired `SemanticRetrievalEngine`/`HashEmbeddingModel` (they could not be wired up as written — `Memory.embedding` is always null, so each search would embed every memory, slower _and_ worse than the keyword path); `IndexedDbDriver`; `assertNever`; and `isSupportedPlatform`. `validateSaveMemoryRequest`/`validateConversationMessages` were dead too, but valuable — they are now wired into the background message boundary rather than deleted.

`@gotomemory/contracts` is bumped `major`, not `minor`: `assertNever` and `isSupportedPlatform` were public exports, and removing a public export is a breaking change for any external consumer regardless of how it's used internally.

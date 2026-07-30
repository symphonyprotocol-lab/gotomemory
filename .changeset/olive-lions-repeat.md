---
"@gotomemory/extension": minor
"@gotomemory/i18n": minor
"@gotomemory/core": minor
"@gotomemory/web": minor
---

Ship the site and the extension in both Chinese and English, defaulting to the browser's language.

A new leaf package, `@gotomemory/i18n`, holds every UI string in `zh` and `en` plus the locale logic. `zh` is the reference dictionary and `en` is typed against it, so adding a key fails to compile until both languages have it; tests additionally assert key parity, matching `{placeholders}`, and no empty strings. Detection walks `navigator.languages` and takes the first supported tag — any `zh-*` variant is Chinese, everything else falls back to English rather than to the author's language. English strings that carry a count use a `"one|other"` form selected on `{count}`; Chinese doesn't inflect and carries no separator.

**Web.** An `I18nProvider` resolves the language during the initial render (browser language, or a previous choice from `localStorage`), so the page never flashes the wrong one. The header carries a toggle labelled in the language it switches _to_, and `<html lang>` plus the document title follow the active language.

**Extension.** The panel markup now ships label keys instead of literal text, and `applyPanelText` writes the strings in. Switching language re-labels the live panel rather than re-rendering it, so bound handlers, the collapsed/expanded state, and an open drawer all survive. A "language" select in the panel settings offers 跟随浏览器 / 中文 / English and persists to the new `locale` setting (`"auto"` by default); a choice made while settings are still loading wins over the stored value instead of being clobbered by the round-trip. Timestamps in the memory library go through `Intl` for the active locale, and the store listing is localized through `_locales/{en,zh_CN,zh_TW}/messages.json` with `__MSG__` placeholders in the manifest — a test keeps those files in sync with the dictionary.

**Category inference.** `inferCategory` had a rich Chinese keyword list next to two or three English ones, so an English speaker's memories mostly landed in `other` — which also kept them out of the post-export suggestion box. English now has comparable coverage for all three categories (standing instructions, project background, personal facts). Two fixes came with it: Latin keywords are word-bounded, so "The report is due" is no longer project background and "Fix the projection matrix" no longer matches `project`; and matching uses the `i` flag instead of lower-casing the input, which under a Turkish locale turned "I" into a dotless "ı" and would have broken every "I am …" pattern.

Two pieces of _conversation_ text follow the UI language too, since both end up in the user's own prompt: the framing around injected memories (`formatAuthorizedMemoryPrompt(memories, locale)`) and the starter memories (`memoryTemplates(locale)` — an English speaker seeding "回答一律使用中文" was the opposite of helpful). `pickUnappliedTemplates` now takes a locale and offers only that language's seeds.

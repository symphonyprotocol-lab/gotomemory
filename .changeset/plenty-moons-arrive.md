---
"@gotomemory/web": minor
"@gotomemory/i18n": minor
"@gotomemory/extension": minor
---

Fix the site's dead in-page navigation, give visitors a store-first install path, and clear the two things that blocked a store upload.

**Why "Install extension" did nothing.** `apps/web/index.html` had no doctype, so the page rendered in quirks mode, where `<html>` sizes to the whole document rather than the viewport. Fragment navigation then updated `location.hash` without scrolling anywhere — every nav link was affected, not just the install button, and a click looked like a no-op. Adding `<!doctype html>` restores standards mode (`document.compatMode: "CSS1Compat"`), and a test now asserts the doctype so this cannot regress silently.

**Where the install button pointed.** It targeted `#export`, a feature section, and the closing band's button was `href="#"` — a literal no-op. Both now go to a new install section, and the anchored sections carry `scroll-mt-20` so the sticky header does not cover the heading they land on.

**The install section is store-first.** It is a page for visitors, so it carries no build tooling: the three steps are "Add to Chrome" → open an assistant → export or save, and a test asserts the page mentions no `pnpm`, no `chrome://extensions`, and no build output path. The store link lives in a single constant, `CHROME_WEB_STORE_URL` in `App.tsx`; while it is `null` the section states plainly that the listing is in review and offers the repository instead, because a guessed store URL would drop visitors on a 404 from a page that promised them an install.

**Manifest version.** It was the literal `0.0.0` in `wxt.config.ts`, which the Chrome Web Store will not accept as a release and which no release process touched. It now comes from `@gotomemory/extension`'s package version — the one changesets already bumps — via `extensionVersion` in `src/manifest.ts`, and the package is at `1.0.0` for the first public release. A test rejects anything the store would: more than four parts, non-numeric or prerelease parts, leading zeros, values above 65535, and the `0.0.0` placeholder. Note that Chrome's format is narrower than semver, so a changesets _prerelease_ version would need stripping here. `wxt zip` also produced `gotomemoryextension-<version>-chrome.zip`, named after the package rather than the product; `zip.name` makes it `gotomemory-1.0.0-chrome.zip`.

**Privacy policy.** Store review needs a policy URL, and the site had only a marketing section about privacy. There is now a bilingual policy at `/privacy/`, linked from the footer. It is a second Vite HTML entry rather than a client-side route, so the URL resolves as a real file on any static host — a policy link that 404s fails review, and the repo has no SPA-fallback config to rely on. The content is written against what the code actually does, so two claims have to be maintained with it: the single outbound request to `config.gotomemory.dev` (read-only, at most one per six hours, no user data, and the host still sees an IP — disclosed rather than glossed), and the absence of sync, which holds because `@gotomemory/sync` is deliberately not an extension dependency. Tests assert both, and that the English render leaves no Chinese behind.

The header also carries a GitHub link — the project's own mark, `aria-label`led because it is icon-only, and hidden below `sm` where the header only fits the wordmark, the language toggle and the install button. Both HTML entries declare a canonical URL on `gotomemory.dev`.

**The selector-config endpoint pointed at a domain we do not own.** `SELECTOR_OVERRIDES_URL` was `https://config.gotomemory.app/…`, but the project holds only `gotomemory.dev`. That is not a branding slip: this URL is the one host every install contacts, so it receives an IP address from every user, and anyone could have registered the unclaimed `.app` name and started collecting those requests — while the privacy policy described the endpoint as ours. It is now `config.gotomemory.dev`, along with the signing tooling's docs, the implementation checklist, and the policy text in both languages. A new test asserts the URL is https and stays on a hostname under `gotomemory.dev`, so the invariant is checked rather than remembered.

Two things still need a human before submitting: `privacy@gotomemory.dev` has to actually receive mail, and `SELECTOR_OVERRIDES_PUBLIC_KEY` in `src/selector-config.ts` is still the placeholder, so every fetched selector config fails verification and the extension silently keeps its built-in selectors.

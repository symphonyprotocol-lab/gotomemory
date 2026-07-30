/**
 * The browser localizes the store listing itself, from `public/_locales/<tag>/
 * messages.json`, by substituting `__MSG_key__` placeholders. Chrome picks the
 * folder from the *browser's* UI language and falls back to `default_locale`,
 * which is why the name/description here are placeholders rather than literals.
 */
import pkg from "../package.json";

/**
 * The version the store sees. Chrome refuses an upload whose version does not
 * increase, so this has to come from something that actually moves on release —
 * the package version, which changesets bumps — rather than a literal in the
 * wxt config that nobody remembers to touch. Chrome's format is 1–4
 * dot-separated integers (0–65535, no leading zeros), which is narrower than
 * semver: a prerelease like `1.1.0-beta.0` is rejected, so releases must stay
 * on plain versions (a changesets pre-release would need stripping here).
 */
export const extensionVersion: string = pkg.version;

export const defaultLocale = "en";
export const manifestName = "__MSG_extName__";
export const manifestDescription = "__MSG_extDescription__";

export const hostPermissions = [
  "https://chatgpt.com/*",
  "https://claude.ai/*",
  "https://gemini.google.com/*"
];

// unlimitedStorage: whole-conversation saves grow past chrome.storage.local's
// default ~10MB quota quickly; without it long-time users hit hard write errors.
export const permissions = ["storage", "unlimitedStorage"];

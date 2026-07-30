/**
 * Shared bilingual (zh/en) UI strings for every GotoMemory surface, plus the
 * browser-language detection both the web app and the extension default to.
 *
 * This package is a leaf: it holds text and locale logic only, so any layer —
 * domain packages, the React site, the content-script panel — can depend on it.
 */

import { en } from "./messages/en.js";
import { zh, type MessageKey, type Messages } from "./messages/zh.js";
import type { Locale } from "./locale.js";

export {
  detectBrowserLocale,
  detectLocale,
  isLocale,
  isLocalePreference,
  localeTag,
  matchLocale,
  resolveLocale,
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
  type LocalePreference
} from "./locale.js";
export { en, zh, type MessageKey, type Messages };

export const messages: Record<Locale, Messages> = { zh, en };

export type TranslateParams = Record<string, string | number>;

export type Translator = (key: MessageKey, params?: TranslateParams) => string;

/**
 * Pick the singular or plural wording of a counted string.
 *
 * The convention is deliberately minimal: `"one form|other form"`, chosen on
 * `params.count === 1`. That covers English, which is the only language here
 * that inflects; Chinese strings simply omit the separator and are returned
 * whole. A fuller CLDR plural implementation would buy nothing today.
 */
function selectPlural(template: string, params?: TranslateParams): string {
  const count = params?.count;
  if (typeof count !== "number" || !template.includes("|")) {
    return template;
  }
  const [one, other] = template.split("|");
  return (count === 1 ? one : other) ?? template;
}

/**
 * Look up `key` in `locale` and fill `{name}` placeholders. A key missing from
 * a locale falls back to the reference dictionary rather than rendering an
 * empty string, so a translation gap degrades to Chinese instead of a blank UI.
 */
export function translate(locale: Locale, key: MessageKey, params?: TranslateParams): string {
  const template = selectPlural(messages[locale][key] ?? zh[key], params);
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** Bind a locale once; the panel and the site both hold on to the result. */
export function createTranslator(locale: Locale): Translator {
  return (key, params) => translate(locale, key, params);
}

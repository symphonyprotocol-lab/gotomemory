/**
 * Locale resolution. Two supported UI languages; everything that is not
 * Chinese falls back to English, so an unknown browser tag never leaves the
 * user staring at a language they can't read.
 */

export type Locale = "zh" | "en";

/** What the user can choose: an explicit language, or "follow the browser". */
export type LocalePreference = Locale | "auto";

export const SUPPORTED_LOCALES: readonly Locale[] = ["zh", "en"];

export const FALLBACK_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return value === "zh" || value === "en";
}

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === "auto" || isLocale(value);
}

/**
 * Map one BCP-47 tag to a supported locale. Returns null when the tag names a
 * language we don't ship, so callers can keep scanning the preference list
 * instead of settling for the fallback on the first miss.
 */
export function matchLocale(tag: string | undefined | null): Locale | null {
  const primary = (tag ?? "").trim().toLowerCase().split(/[-_]/)[0];
  if (primary === "zh") {
    return "zh";
  }
  if (primary === "en") {
    return "en";
  }
  return null;
}

/**
 * Pick the UI locale from the browser's ordered language preferences. The
 * first tag we support wins; when nothing matches (a French browser, say) we
 * use English rather than the author's own language.
 */
export function detectLocale(languages?: readonly string[] | string | null): Locale {
  const list = typeof languages === "string" ? [languages] : (languages ?? []);
  for (const tag of list) {
    const matched = matchLocale(tag);
    if (matched) {
      return matched;
    }
  }
  return FALLBACK_LOCALE;
}

interface NavigatorLike {
  languages?: readonly string[];
  language?: string;
}

/** `detectLocale` against the ambient navigator; safe to call during SSR/tests. */
export function detectBrowserLocale(nav?: NavigatorLike | null): Locale {
  const source =
    nav ?? (typeof navigator === "undefined" ? null : (navigator as unknown as NavigatorLike));
  if (!source) {
    return FALLBACK_LOCALE;
  }
  const languages = source.languages?.length
    ? source.languages
    : source.language
      ? [source.language]
      : [];
  return detectLocale(languages);
}

/** Resolve a stored preference against the browser, so "auto" stays dynamic. */
export function resolveLocale(preference: LocalePreference, nav?: NavigatorLike | null): Locale {
  return preference === "auto" ? detectBrowserLocale(nav) : preference;
}

/** The BCP-47 tag to stamp on `<html lang>` and hand to Intl. */
export function localeTag(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en-US";
}

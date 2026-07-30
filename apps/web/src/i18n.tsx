/**
 * Language for the marketing site: the browser's by default, overridable with
 * the header switch and remembered in localStorage.
 *
 * Rendering is synchronous and locale-aware from the first paint — the locale
 * is resolved during the initial state computation, not in an effect — so the
 * page never flashes the wrong language.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  createTranslator,
  detectBrowserLocale,
  isLocale,
  localeTag,
  type Locale,
  type MessageKey,
  type Translator
} from "@gotomemory/i18n";

const STORAGE_KEY = "gotomemory:locale";

interface I18nValue {
  locale: Locale;
  t: Translator;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

/** A previous explicit choice, if the visitor made one and storage is readable. */
function storedLocale(): Locale | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    // Private mode / blocked storage: fall back to the browser language.
    return null;
  }
}

function initialLocale(override?: Locale): Locale {
  if (override) {
    return override;
  }
  if (typeof window === "undefined") {
    return detectBrowserLocale(null);
  }
  return storedLocale() ?? detectBrowserLocale();
}

export function I18nProvider({
  locale,
  /** Which string names this page in the tab — each entry point has its own. */
  title = "web.meta.title",
  children
}: {
  locale?: Locale;
  title?: MessageKey;
  children: ReactNode;
}) {
  const [current, setCurrent] = useState<Locale>(() => initialLocale(locale));

  // A `locale` prop is an explicit caller decision (tests, future SSR), so it
  // wins over whatever the visitor's browser or storage said.
  useEffect(() => {
    if (locale) {
      setCurrent(locale);
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setCurrent(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Remembering the choice is a nicety; switching still works without it.
    }
  }, []);

  // Screen readers and browser translation prompts key off <html lang>, and the
  // tab title is the other piece of chrome outside the React tree.
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.lang = localeTag(current);
    document.title = createTranslator(current)(title);
  }, [current, title]);

  const value = useMemo<I18nValue>(
    () => ({ locale: current, t: createTranslator(current), setLocale }),
    [current, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return value;
}

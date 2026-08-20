import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import i18next from "i18next";
import { I18nextProvider, useTranslation } from "react-i18next";

import en from "@/locales/en.json";
import nl from "@/locales/nl.json";
import fr from "@/locales/fr.json";
import de from "@/locales/de.json";

export type Locale = "nl" | "en" | "fr" | "de";

export const LOCALES: Locale[] = ["nl", "en", "fr", "de"];

export const STORAGE_KEY = "rout_lang";

const RESOURCES = {
  en: { translation: en },
  nl: { translation: nl },
  fr: { translation: fr },
  de: { translation: de },
} as const;

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as string[]).includes(value);
}

/**
 * Language resolution order: explicit choice in localStorage, then the browser
 * or system language (Dutch/Flemish wins for `nl`), then English as the
 * international default. URLs stay clean — the locale never appears as a path
 * prefix, and the header switcher always allows a manual override.
 */
export function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* storage unavailable — fall through to browser detection */
  }
  const langs = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  for (const raw of langs) {
    const tag = raw.toLowerCase();
    if (tag.startsWith("nl") || tag === "be" || tag.startsWith("nl-be")) return "nl";
    if (tag.startsWith("fr")) return "fr";
    if (tag.startsWith("de")) return "de";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

if (!i18next.isInitialized) {
  void i18next.init({
    resources: RESOURCES,
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export { i18next as i18n };

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? "en");

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    void i18next.changeLanguage(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable — in-memory locale still applies */
    }
  }, []);

  // Detect once on mount unless a route pinned the locale explicitly.
  useEffect(() => {
    const next = initialLocale ?? detectLocale();
    setLocaleState(next);
    void i18next.changeLanguage(next);
  }, [initialLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, unknown>) =>
      i18next.getFixedT(locale)(key, params ?? {}) as string,
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return (
    <I18nextProvider i18n={i18next}>
      <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
    </I18nextProvider>
  );
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  // Safe fallback so components stay usable outside the provider.
  return {
    locale: (i18next.language as Locale) ?? "en",
    setLocale: () => {},
    t: (k, params) => i18next.t(k, params ?? {}) as string,
  };
}

export { useTranslation };

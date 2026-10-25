// Central list of supported locales. Add a locale here and drop a matching
// messages/<locale>.json file and it flows through the whole app (request config,
// <html lang>, the settings switcher).
export const locales = ["en", "nl"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** A cookie or setting value as a supported locale; anything else is the default. */
export function parseLocale(value: string | null | undefined): Locale {
  return locales.includes(value as Locale) ? (value as Locale) : defaultLocale;
}

// Cookie the chosen locale is persisted in. next-intl has no i18n *routing* here
// (no /en or /nl URL segment) — the locale lives entirely in this cookie, which the
// request config below reads on every render.
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const localeNames: Record<Locale, string> = {
  en: "English",
  nl: "Nederlands",
};

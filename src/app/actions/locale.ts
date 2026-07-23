"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, locales, type Locale } from "@/i18n/config";

// Persists the chosen locale in the cookie the i18n request config reads. The caller
// (the settings switcher) refreshes the router afterwards so the new messages render.
export async function setLocale(locale: Locale) {
  if (!locales.includes(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
  });
}

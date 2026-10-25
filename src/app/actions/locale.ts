"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, locales, type Locale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth";
import { applyCategoryNamesLocale } from "@/lib/category-locale";

// Persists the chosen locale in the cookie the i18n request config reads. The caller
// (the settings switcher, the sign-in page, the onboarding) refreshes the router
// afterwards so the new messages render.
//
// For a signed-in user it also puts the default category names the household never
// renamed in the new language (see localizeDefaultCategories). Signed out (the sign-in
// page's switch) only the cookie changes: the categories are household data.
export async function setLocale(locale: Locale) {
  if (!locales.includes(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
  });

  if (!(await getCurrentUser())) return;
  try {
    applyCategoryNamesLocale(locale);
  } catch (err) {
    console.error("[locale] renaming the default categories failed:", err);
  }
  revalidatePath("/", "layout");
}

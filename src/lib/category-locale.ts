import type { Database } from "better-sqlite3";
import { db } from "@/db";
import type { Locale } from "@/i18n/config";
import { getCategoryNamesLocale, localizeDefaultCategories } from "@/lib/config-sync";

// The app-side entry points of localizeDefaultCategories (src/lib/config-sync.ts), which
// works on the raw better-sqlite3 handle like the rest of the config sync.

function sqlite(): Database {
  return (db as unknown as { $client: Database }).$client;
}

/** Puts the untouched default category names in `locale` (an explicit language choice). */
export function applyCategoryNamesLocale(locale: Locale) {
  return localizeDefaultCategories(sqlite(), locale);
}

// Once the setting exists it is never removed, so after the first hit this process skips
// even the settings read.
let caughtUp = false;

/**
 * One-time catch-up for installs whose default categories were seeded (in English)
 * before the names followed the language: the first signed-in render after the update
 * puts them in that browser's language and records it. After that only a language change
 * (the setLocale action) renames them. Returns true when it renamed anything.
 */
export function ensureCategoryNamesLocale(locale: Locale): boolean {
  if (caughtUp) return false;
  try {
    const handle = sqlite();
    if (getCategoryNamesLocale(handle) !== null) {
      caughtUp = true;
      return false;
    }
    const { renamed } = localizeDefaultCategories(handle, locale);
    caughtUp = true;
    return renamed > 0;
  } catch (err) {
    // A convenience: never let it take the layout down.
    console.error("[category-locale] catch-up failed:", err);
    return false;
  }
}

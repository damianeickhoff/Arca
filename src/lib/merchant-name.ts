// Pure (no database) merchant-name helpers. Kept free of any `@/db` import on purpose:
// the boot-time backfill in src/db/index.ts calls these directly against the raw sqlite
// handle, and importing db from here would make that circular.

import { extractMerchantName } from "@/lib/parse-transaction-location";
import { resolveFriendlyName } from "@/lib/friendly-names";

/** Dedup key for a merchant name: lowercase, accents and punctuation removed, spaces
 * collapsed away entirely — so "Albert Heijn", "ALBERT-HEIJN" and "albertheijn" all
 * collapse onto the same profile. Returns "" for names with no letters/digits at all. */
export function normalizeMerchantKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Best-effort merchant name for a transaction, in precedence order:
 *   1. a configured friendly name for the description (src/config/friendlyNames.ts) —
 *      these are hand-curated brand names, so they beat any heuristic;
 *   2. the location-aware extractor on the description ("ALDI CUL009 TIEL TIEL NLD" → "Aldi");
 *   3. the same extractor on the raw bank description, which sometimes carries the
 *      merchant when the short description doesn't.
 * Returns null when nothing merchant-like could be found — a person-to-person transfer
 * or a bare reference number should stay merchant-less rather than get a junk profile. */
export function deriveMerchantName(row: {
  description: string;
  rawDescription?: string | null;
}): string | null {
  const friendly = resolveFriendlyName(row.description);
  if (friendly) return friendly;

  const fromDescription = extractMerchantName(row.description);
  if (fromDescription) return fromDescription;

  const fromRaw = extractMerchantName(row.rawDescription);
  if (fromRaw) return fromRaw;

  return null;
}

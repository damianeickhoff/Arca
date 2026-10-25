// The names a recurring item matches: its matchPattern plus the optional extra names in
// recurringItems.altMatchPatterns (a bank renamed the payee, so the old and the new name
// both link). No database access here, so the editor (a client component) can share it
// with the matcher in lib/recurring-match.ts.

/** The fields that say which names an item goes by. */
export type PatternSource = {
  matchPattern: string | null;
  /** The stored JSON text, or an already parsed list. */
  altMatchPatterns?: string | string[] | null;
};

/**
 * The extra names stored in recurringItems.altMatchPatterns (a JSON array of strings),
 * trimmed, blanks dropped. Defensive: bad JSON or anything that isn't a list of strings
 * reads as no extra names, so a broken value never stops the main pattern matching.
 */
export function parseAltMatchPatterns(raw: string | string[] | null | undefined): string[] {
  if (raw == null) return [];
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.filter((p): p is string => typeof p === "string").map((p) => p.trim()).filter(Boolean);
}

/**
 * Every name an item matches: its matchPattern first, then the extra names, lowercased
 * and trimmed, blanks dropped. The one place that decides which patterns an item has, so
 * matching, the editor's preview and the paid checks agree.
 */
export function recurringItemPatterns(item: PatternSource): string[] {
  return [item.matchPattern ?? "", ...parseAltMatchPatterns(item.altMatchPatterns)]
    .map((p) => p.toLowerCase().trim())
    .filter(Boolean);
}

/**
 * The values to store for a save: blank names, repeats and copies of the main pattern are
 * dropped from the extra names (null when none are left). With an empty main pattern the
 * first extra name becomes the main one, so an item with names always has a matchPattern
 * (the bill tracker reads that as "this bill auto-matches"). `promote: false` keeps every
 * extra name extra (a save that doesn't touch the main pattern).
 */
export function normalizeMatchPatterns(
  main: string | null | undefined,
  alts: unknown,
  { promote = true }: { promote?: boolean } = {},
): { matchPattern: string | null; altMatchPatterns: string | null } {
  const extra = Array.isArray(alts)
    ? alts.filter((p): p is string => typeof p === "string").map((p) => p.trim()).filter(Boolean)
    : parseAltMatchPatterns(typeof alts === "string" ? alts : null);
  let matchPattern = main?.trim() ? main : null;
  if (promote && !matchPattern && extra.length) matchPattern = extra.shift()!;
  const seen = new Set([(matchPattern ?? "").trim().toLowerCase()]);
  const kept: string[] = [];
  for (const p of extra) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(p);
  }
  return { matchPattern, altMatchPatterns: kept.length ? JSON.stringify(kept) : null };
}

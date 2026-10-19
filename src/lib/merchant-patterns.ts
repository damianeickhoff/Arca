// "Recognised by" patterns: the descriptions that belong to a merchant, whatever the
// heuristic name extractor makes of them ("AH TO GO 4192", "ALBERT HEIJN 1234" →
// Albert Heijn). Pure functions, so the DB boot (better-sqlite3, sync) and the app
// (drizzle, async) match exactly the same way.

export type PatternMatchType = "contains" | "word" | "exact";

export interface MerchantPatternLike {
  merchantId: number;
  pattern: string;
  matchType: string;
}

export function normalizeMatchType(v: unknown): PatternMatchType {
  return v === "word" || v === "exact" ? v : "contains";
}

/** Same semantics as a category rule's description match (see matchRules). */
export function descriptionMatches(description: string, pattern: string, matchType: string): boolean {
  const desc = description.trim().toLowerCase();
  const pat = pattern.trim().toLowerCase();
  if (!pat) return false;
  const type = normalizeMatchType(matchType);
  if (type === "word") {
    const escaped = pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(desc);
  }
  if (type === "contains") return desc.includes(pat);
  return desc === pat;
}

/** Longest (most specific) patterns first, so "AH TO GO" beats a bare "AH". */
export function sortPatterns<T extends MerchantPatternLike>(patterns: T[]): T[] {
  return [...patterns].sort((a, b) => b.pattern.trim().length - a.pattern.trim().length);
}

/** The merchant whose pattern matches a transaction's description (or raw one), or null.
 *  `patterns` should come sorted by sortPatterns. */
export function matchMerchantPattern(
  row: { description: string; rawDescription?: string | null },
  patterns: MerchantPatternLike[],
): number | null {
  for (const p of patterns) {
    if (descriptionMatches(row.description, p.pattern, p.matchType)) return p.merchantId;
    if (row.rawDescription && descriptionMatches(row.rawDescription, p.pattern, p.matchType)) return p.merchantId;
  }
  return null;
}

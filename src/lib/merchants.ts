import { db } from "@/db";
import { merchantPatterns, merchants, transactions } from "@/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { deriveMerchantName, normalizeMerchantKey } from "@/lib/merchant-name";
import { detectBrandIcon } from "@/lib/auto-brand";
import { notInternalTransferCondition } from "@/lib/internal-transfers";
import { descriptionMatches, matchMerchantPattern, normalizeMatchType, sortPatterns, type PatternMatchType } from "@/lib/merchant-patterns";

/** Looks up a merchant by its normalized key, creating it if it doesn't exist yet.
 * Returns null for names that normalize to nothing (pure punctuation/whitespace), and
 * for merchants the user deleted — a deleted profile must not come back the next time
 * its name is derived from an import.
 *
 * `revive: true` (used by an explicit user pick) clears the tombstone instead. */
export async function getOrCreateMerchantId(name: string, revive = false): Promise<number | null> {
  const trimmed = name.trim();
  const key = normalizeMerchantKey(trimmed);
  if (!key) return null;

  const [existing] = await db.select({ id: merchants.id, deleted: merchants.deleted }).from(merchants).where(eq(merchants.normalizedKey, key));
  if (existing) {
    if (!existing.deleted) return existing.id;
    if (!revive) return null;
    await db.update(merchants).set({ deleted: false }).where(eq(merchants.id, existing.id));
    return existing.id;
  }

  // onConflictDoNothing + re-select rather than a bare insert: two imports racing on
  // the same new merchant would otherwise trip the unique index on normalized_key.
  // A brand icon matching the name is applied up front, so merchants show a logo
  // without anyone having to open the editor.
  const brand = detectBrandIcon(trimmed);
  await db
    .insert(merchants)
    .values({ name: trimmed, normalizedKey: key, icon: brand?.iconKey ?? null, color: brand?.color ?? null })
    .onConflictDoNothing();
  const [created] = await db.select({ id: merchants.id }).from(merchants).where(eq(merchants.normalizedKey, key));
  return created?.id ?? null;
}

/** Soft-deletes a merchant and unlinks its transactions. The row survives as a
 * tombstone so auto-derivation doesn't recreate it (see getOrCreateMerchantId). */
export async function deleteMerchant(id: number): Promise<boolean> {
  const [existing] = await db.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, id));
  if (!existing) return false;
  await db.update(transactions).set({ merchantId: null }).where(eq(transactions.merchantId, id));
  await db.update(merchants).set({ deleted: true }).where(eq(merchants.id, id));
  return true;
}

/** Every live merchant's "Recognised by" patterns, most specific first. */
export async function loadMerchantPatterns() {
  const rows = await db
    .select({ merchantId: merchantPatterns.merchantId, pattern: merchantPatterns.pattern, matchType: merchantPatterns.matchType })
    .from(merchantPatterns)
    .innerJoin(merchants, eq(merchants.id, merchantPatterns.merchantId))
    .where(eq(merchants.deleted, false));
  return sortPatterns(rows);
}

/** Derives the merchant for a transaction's description and returns its id, creating
 * the profile on first sight. A merchant's "Recognised by" patterns come first, then
 * the name heuristic. Null when no merchant name could be extracted. */
export async function resolveMerchantIdFor(row: {
  description: string;
  rawDescription?: string | null;
}): Promise<number | null> {
  const byPattern = matchMerchantPattern(row, await loadMerchantPatterns());
  if (byPattern != null) return byPattern;
  const name = deriveMerchantName(row);
  if (!name) return null;
  return getOrCreateMerchantId(name);
}

export type MerchantPatternItem = { pattern: string; matchType: PatternMatchType };

export type MerchantListItem = {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  /** Where apply-rules files its transactions when no category rule matches. */
  defaultCategoryId: number | null;
  /** "Recognised by". */
  patterns: MerchantPatternItem[];
  transactionCount: number;
  totalSpent: number;
  lastVisit: string | null;
};

/** Every merchant with its transaction count and total expense spend — powers the
 * merchant picker and the Merchants settings panel. Ordered by name. */
export async function listMerchants(): Promise<MerchantListItem[]> {
  const rows = await db
    .select({
      id: merchants.id,
      name: merchants.name,
      icon: merchants.icon,
      color: merchants.color,
      defaultCategoryId: merchants.defaultCategoryId,
      transactionCount: sql<number>`COUNT(${transactions.id})`,
      // Expenses only, mirroring the merchant profile's own scope.
      totalSpent: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.direction} = 'expense' THEN COALESCE(${transactions.correctedAmount}, ${transactions.amount}) ELSE 0 END), 0)`,
      lastVisit: sql<string | null>`MAX(${transactions.date})`,
    })
    .from(merchants)
    .leftJoin(transactions, eq(transactions.merchantId, merchants.id))
    .where(eq(merchants.deleted, false))
    .groupBy(merchants.id)
    .orderBy(asc(merchants.name));
  const patterns = await db.select().from(merchantPatterns).orderBy(asc(merchantPatterns.id));
  const byMerchant = new Map<number, MerchantPatternItem[]>();
  for (const p of patterns) {
    const list = byMerchant.get(p.merchantId) ?? [];
    list.push({ pattern: p.pattern, matchType: normalizeMatchType(p.matchType) });
    byMerchant.set(p.merchantId, list);
  }
  return rows.map((r) => ({ ...r, patterns: byMerchant.get(r.id) ?? [] }));
}

/**
 * Replaces a merchant's "Recognised by" patterns and links every transaction they
 * match to it: an explicit "this description is that merchant", so it also moves
 * transactions the name heuristic had put under another merchant. Internal transfers
 * keep having no merchant. Returns how many transactions were linked.
 */
export async function setMerchantPatterns(merchantId: number, patterns: { pattern: string; matchType?: string }[]): Promise<number> {
  const kept: MerchantPatternItem[] = [];
  for (const p of patterns) {
    const pattern = typeof p.pattern === "string" ? p.pattern.trim() : "";
    if (pattern.length < 2 || kept.some((k) => k.pattern.toLowerCase() === pattern.toLowerCase())) continue;
    kept.push({ pattern, matchType: normalizeMatchType(p.matchType) });
  }

  await db.delete(merchantPatterns).where(eq(merchantPatterns.merchantId, merchantId));
  if (kept.length === 0) return 0;
  await db.insert(merchantPatterns).values(kept.map((p) => ({ merchantId, ...p })));

  const rows = await db
    .select({ id: transactions.id, description: transactions.description, rawDescription: transactions.rawDescription, merchantId: transactions.merchantId })
    .from(transactions)
    .where(notInternalTransferCondition);
  let linked = 0;
  for (const row of rows) {
    if (row.merchantId === merchantId) continue;
    const hit = kept.some(
      (p) => descriptionMatches(row.description, p.pattern, p.matchType) || (!!row.rawDescription && descriptionMatches(row.rawDescription, p.pattern, p.matchType)),
    );
    if (!hit) continue;
    await db.update(transactions).set({ merchantId }).where(eq(transactions.id, row.id));
    linked++;
  }
  return linked;
}

/** Assigns merchants to transactions that don't have one yet — the backfill for rows
 * imported before this feature existed, and the safety net for any insert path that
 * forgot to set one. Safe to call repeatedly: it only touches merchant_id IS NULL rows
 * and never overwrites a manual assignment. Internal transfers are skipped — a transfer
 * between your own accounts has no merchant by definition. */
export async function assignMissingMerchants(limit = 5000): Promise<number> {
  const rows = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      rawDescription: transactions.rawDescription,
    })
    .from(transactions)
    .where(sql`${transactions.merchantId} IS NULL AND ${notInternalTransferCondition}`)
    .orderBy(desc(transactions.date))
    .limit(limit);

  let assigned = 0;
  for (const row of rows) {
    const merchantId = await resolveMerchantIdFor(row);
    if (merchantId == null) continue;
    await db.update(transactions).set({ merchantId }).where(eq(transactions.id, row.id));
    assigned++;
  }
  return assigned;
}

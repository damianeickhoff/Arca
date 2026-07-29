import { db } from "@/db";
import { merchants, transactions } from "@/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits, getTransactionSplitTotal } from "@/lib/transaction-splits";
import { resolveDisplayName } from "@/lib/friendly-names";
import type { CategorySpendPoint } from "@/lib/category-detail";

export interface MerchantVisit {
  id: number;
  date: string;
  amount: number;
  name: string;
  account: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
}

export interface MerchantYearPoint {
  year: string; // YYYY
  amount: number;
  visits: number;
}

export interface MerchantCategorySlice {
  categoryId: number | null;
  categoryName: string;
  color: string | null;
  icon: string | null;
  amount: number;
  visits: number;
  pct: number; // 0-100, share of total spend at this merchant
}

export interface MerchantDetail {
  merchantId: number;
  name: string;
  icon: string | null;
  color: string | null;
  totalSpent: number;
  visitCount: number;
  avgVisit: number | null;
  largestPurchase: number | null;
  firstVisit: string | null;
  lastVisit: string | null;
  /** Cumulative spend per month across the merchant's whole history — feeds the same
   * CategorySpendChart the category detail uses. `forecast` is always null: a merchant
   * profile has no budget period to project a pace against. */
  chart: CategorySpendPoint[];
  yearly: MerchantYearPoint[];
  categories: MerchantCategorySlice[];
  recent: MerchantVisit[];
}

const RECENT_LIMIT = 10;

/** All-time profile for one merchant: the headline stats, a per-year trend, the split
 * of categories its transactions landed in, and the most recent purchases.
 *
 * Scope decisions, mirroring how the rest of the app counts spend:
 *  - expenses only (an incoming refund from a shop isn't a "visit");
 *  - internal transfers excluded;
 *  - a visit is one *transaction*, so a split expense counts once and at its full
 *    amount for the visit stats — only the category breakdown uses the split parts;
 *  - amounts are gross: reimbursements received are not netted off, same as the
 *    category detail page.
 *
 * `from`/`to` optionally narrow the window; omitted means all time. */
export async function getMerchantDetail(
  merchantId: number,
  from?: string | null,
  to?: string | null,
): Promise<MerchantDetail | null> {
  const [merchant] = await db.select().from(merchants).where(eq(merchants.id, merchantId));
  if (!merchant) return null;

  const rangeConditions = [
    eq(transactions.merchantId, merchantId),
    eq(transactions.direction, "expense"),
    sql`not (${isInternalTransferExpr})`,
  ];
  if (from) rangeConditions.push(gte(transactions.date, from));
  if (to) rangeConditions.push(lte(transactions.date, to));

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      direction: transactions.direction,
      amount: transactions.amount,
      correctedAmount: transactions.correctedAmount,
      description: transactions.description,
      customName: transactions.customName,
      account: transactions.account,
      categoryId: transactions.categoryId,
      isReimbursement: transactions.isReimbursement,
      categoryName: sql<string | null>`(SELECT c.name FROM categories c WHERE c.id = ${transactions.categoryId})`,
      categoryColor: sql<string | null>`(SELECT c.color FROM categories c WHERE c.id = ${transactions.categoryId})`,
      categoryIcon: sql<string | null>`(SELECT c.icon FROM categories c WHERE c.id = ${transactions.categoryId})`,
    })
    .from(transactions)
    .where(and(...rangeConditions))
    .orderBy(desc(transactions.date), desc(transactions.id));

  const empty: MerchantDetail = {
    merchantId: merchant.id,
    name: merchant.name,
    icon: merchant.icon,
    color: merchant.color,
    totalSpent: 0,
    visitCount: 0,
    avgVisit: null,
    largestPurchase: null,
    firstVisit: null,
    lastVisit: null,
    chart: [],
    yearly: [],
    categories: [],
    recent: [],
  };
  if (rows.length === 0) return empty;

  // ── Per-visit figures (one entry per transaction, splits summed back together) ──
  const perVisit = rows.map((r) => ({
    ...r,
    total: getTransactionSplitTotal(r.amount, r.correctedAmount),
  }));

  const totalSpent = perVisit.reduce((s, v) => s + v.total, 0);
  const visitCount = perVisit.length;
  const largestPurchase = Math.max(...perVisit.map((v) => v.total));
  const dates = perVisit.map((v) => v.date).sort();
  const firstVisit = dates[0];
  const lastVisit = dates[dates.length - 1];

  // ── Cumulative monthly chart. Every month from the first visit through today gets
  //    a point (flat stretches where nothing was spent are meaningful here), so the
  //    curve reads as "total spent at this merchant so far". ──
  const monthTotals = new Map<string, number>();
  for (const v of perVisit) {
    const month = v.date.slice(0, 7);
    monthTotals.set(month, (monthTotals.get(month) ?? 0) + v.total);
  }
  const chart: CategorySpendPoint[] = [];
  {
    // Start a month *before* the first visit, at zero, so even a merchant with a
    // single purchase this month plots a rising line rather than a lone point.
    const [firstY, firstM] = firstVisit.split("-").map(Number);
    const startY = firstM === 1 ? firstY - 1 : firstY;
    const startM = firstM === 1 ? 12 : firstM - 1;
    // Run to today rather than the last visit, so a merchant with a single month of
    // history still produces a line (and any merchant's curve is flat up to now,
    // which is exactly what "nothing spent here since" should look like).
    const now = new Date();
    const endY = Math.max(now.getFullYear(), Number(lastVisit.slice(0, 4)));
    const endM = endY === now.getFullYear() ? now.getMonth() + 1 : 12;
    let running = 0;
    for (let y = startY, m = startM; y < endY || (y === endY && m <= endM); m === 12 ? (m = 1, y++) : m++) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      running += monthTotals.get(key) ?? 0;
      chart.push({ date: `${key}-01`, actual: running, forecast: null });
    }
  }

  // ── Yearly trend ──
  const yearTotals = new Map<string, { amount: number; visits: number }>();
  for (const v of perVisit) {
    const year = v.date.slice(0, 4);
    const cur = yearTotals.get(year) ?? { amount: 0, visits: 0 };
    cur.amount += v.total;
    cur.visits += 1;
    yearTotals.set(year, cur);
  }
  // Fill the gaps so a year without a single visit still shows as an empty bar
  // instead of silently collapsing the trend into a misleading straight line.
  const firstYear = Number(firstVisit.slice(0, 4));
  const lastYear = Number(lastVisit.slice(0, 4));
  const yearly: MerchantYearPoint[] = [];
  for (let y = firstYear; y <= lastYear; y++) {
    const key = String(y);
    const hit = yearTotals.get(key);
    yearly.push({ year: key, amount: hit?.amount ?? 0, visits: hit?.visits ?? 0 });
  }

  // ── Category breakdown — split-aware, so a split receipt contributes to each of
  //    its categories proportionally rather than only its primary one. ──
  const splitRows = await getTransactionSplitRows(rows.map((r) => r.id));
  const splitMap = groupTransactionSplits(splitRows);
  const allocations = buildSplitAllocations(rows, splitMap);

  const byCategory = new Map<string, MerchantCategorySlice>();
  const visitsPerCategory = new Map<string, Set<number>>();
  for (const a of allocations) {
    const key = a.categoryId != null ? String(a.categoryId) : "none";
    const slice = byCategory.get(key) ?? {
      categoryId: a.categoryId,
      categoryName: a.categoryName ?? "Uncategorized",
      color: a.categoryColor ?? null,
      icon: a.categoryIcon ?? null,
      amount: 0,
      visits: 0,
      pct: 0,
    };
    slice.amount += a.amount;
    byCategory.set(key, slice);
    const seen = visitsPerCategory.get(key) ?? new Set<number>();
    seen.add(a.transactionId);
    visitsPerCategory.set(key, seen);
  }
  const categorySlices = [...byCategory.entries()]
    .map(([key, slice]) => ({
      ...slice,
      visits: visitsPerCategory.get(key)?.size ?? 0,
      pct: totalSpent > 0 ? (slice.amount / totalSpent) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // ── Recent purchases ──
  const recent: MerchantVisit[] = perVisit.slice(0, RECENT_LIMIT).map((v) => ({
    id: v.id,
    date: v.date,
    amount: v.total,
    name: resolveDisplayName({ customName: v.customName, description: v.description }),
    account: v.account,
    categoryName: v.categoryName,
    categoryColor: v.categoryColor,
    categoryIcon: v.categoryIcon,
  }));

  return {
    ...empty,
    totalSpent,
    visitCount,
    avgVisit: totalSpent / visitCount,
    largestPurchase,
    firstVisit,
    lastVisit,
    chart,
    yearly,
    categories: categorySlices,
    recent,
  };
}

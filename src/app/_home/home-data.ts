import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";

// Read-only figures for the redesigned Home that the existing dashboard query does not
// already produce. Nothing here writes, and every rule follows the dashboard's own
// spending definition (split-aware; internal transfers, reimbursements and money moved
// into savings categories are not spending).

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole days from `from` to `to`, both inclusive. */
export function daysInclusive(from: string, to: string) {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000) + 1);
}

/** The day after `date`, as YYYY-MM-DD. */
export function nextDay(date: string) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return toDateStr(d);
}

export function todayStr() {
  return toDateStr(new Date());
}

/** How many past weeks the "usual week" is averaged over. */
const BASELINE_WEEKS = 8;

export interface WeekNudge {
  /** Spend in the last 7 days, today included. */
  thisWeek: number;
  /** Average spend per 7 days over the BASELINE_WEEKS before that. */
  usualWeek: number;
  /** The category whose spend moved most in the direction of the change, if any. */
  category: string | null;
}

/**
 * This week's spending against a usual week, for the Home nudge. Null when there isn't
 * at least two weeks of history before this one to compare against — a "usual week"
 * from a single data point would just be noise.
 */
export async function getWeekNudge(): Promise<WeekNudge | null> {
  const now = new Date();
  const today = toDateStr(now);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  const baselineStart = new Date(weekStart);
  baselineStart.setDate(weekStart.getDate() - BASELINE_WEEKS * 7);
  const weekFrom = toDateStr(weekStart);
  const from = toDateStr(baselineStart);

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      direction: transactions.direction,
      amount: transactions.amount,
      correctedAmount: transactions.correctedAmount,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryGroup: categories.group,
      isReimbursement: transactions.isReimbursement,
      isInternalTransfer: isInternalTransferExpr,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, today), eq(transactions.direction, "expense")));

  if (rows.length === 0) return null;
  const splitMap = groupTransactionSplits(await getTransactionSplitRows(rows.map((r) => r.id)));
  const allocations = buildSplitAllocations(rows, splitMap).filter(
    (a) => !a.isInternalTransfer && !a.isReimbursement && a.categoryGroup !== "savings",
  );

  const earliest = allocations.reduce((min, a) => (a.date < min ? a.date : min), today);
  // Weeks of history actually covered before this week, capped at the baseline window.
  const historyDays = Math.min(BASELINE_WEEKS * 7, Math.max(0, daysInclusive(earliest, weekFrom) - 1));
  if (historyDays < 14) return null;

  let thisWeek = 0;
  let baseline = 0;
  const thisByCat = new Map<string, number>();
  const baseByCat = new Map<string, number>();
  for (const a of allocations) {
    const name = a.categoryName ?? null;
    if (a.date >= weekFrom) {
      thisWeek += a.amount;
      if (name) thisByCat.set(name, (thisByCat.get(name) ?? 0) + a.amount);
    } else {
      baseline += a.amount;
      if (name) baseByCat.set(name, (baseByCat.get(name) ?? 0) + a.amount);
    }
  }
  const weeks = historyDays / 7;
  const usualWeek = baseline / weeks;

  // The category that moved most in the same direction as the total.
  const up = thisWeek >= usualWeek;
  let category: string | null = null;
  let best = 0;
  for (const name of new Set([...thisByCat.keys(), ...baseByCat.keys()])) {
    const delta = (thisByCat.get(name) ?? 0) - (baseByCat.get(name) ?? 0) / weeks;
    const moved = up ? delta : -delta;
    if (moved > best) {
      best = moved;
      category = name;
    }
  }

  return { thisWeek, usualWeek, category };
}

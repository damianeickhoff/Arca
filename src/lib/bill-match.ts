import type { RecurringItem } from "@/db/schema";
import { shiftDate } from "@/lib/date-range";
import { occurrencesBetween } from "@/lib/recurring-occurrence";
import { amountSatisfiesRecurringItem, transactionMatchesRecurringItem } from "@/lib/recurring-match";

// Which transaction paid which due date of a recurring item — the one rule behind the
// bill statuses (lib/bill-status.ts), the debt balances (lib/debt-recurring-paid.ts) and,
// through the statuses, the cash-flow forecast. No db here, so it is tested on its own.
//
// Every due date takes its nearest payment, wherever the financial month boundary falls:
// a bill due on the 22nd and collected on the 24th is paid, even though the 24th starts
// the next month. Each transaction pays one due date of one item, so a charge two items'
// patterns both match (O2T vs the gym that shares its payee) only pays the one it fits best.

export type BillTx = {
  id: number;
  date: string;
  amount: number;
  direction: string;
  description: string;
  /** The bank's full text; bank sync shortens description ("APPLE.COM BILL"). */
  rawDescription: string | null;
  /** The item the transaction was linked to at import: it pays that item and no other. */
  recurringItemId: number | null;
};

export type BillMatchItem = Pick<
  RecurringItem,
  | "id"
  | "type"
  | "frequency"
  | "dueDay"
  | "startDate"
  | "endDate"
  | "amount"
  | "matchPattern"
  | "altMatchPatterns"
  | "matchWholeWord"
  | "matchAmount"
  | "matchAmountMin"
  | "matchAmountMax"
>;

/** "income" or "expense": which way the money moves when this item is paid. */
export type DirectionOf = (item: BillMatchItem) => string;

const defaultDirection: DirectionOf = (item) => (item.type === "income" ? "income" : "expense");

/** How many days a payment may land before or after a due date and still pay it: half
 *  the gap to the next one, at most 15 (a loan collected on the 30th for the 22nd). */
export function paymentReachDays(frequency: string): number {
  return frequency === "weekly" ? 3 : frequency === "four_weekly" ? 14 : 15;
}

/** Days the matcher looks past a range on either side, so a due date just outside it
 *  claims its own payment first and the answer for a date doesn't depend on which range
 *  was asked for. Load transactions this far around the range (plus the reach). */
export const MATCH_CONTEXT_DAYS = 45;

function daysBetween(a: string, b: string): number {
  return Math.round(Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);
}

/**
 * Whether a transaction can pay this item at all: it moves the right way and isn't €0,
 * and it is linked to this item, or linked to none and its description or full bank text
 * matches the item's pattern and amount rule.
 */
export function paymentFitsItem(tx: BillTx, item: BillMatchItem, direction: DirectionOf = defaultDirection): boolean {
  if (tx.direction !== direction(item) || Math.round(Math.abs(tx.amount) * 100) === 0) return false;
  if (tx.recurringItemId != null) return tx.recurringItemId === item.id;
  return (
    transactionMatchesRecurringItem(tx.description, tx.amount, item) ||
    (tx.rawDescription != null && transactionMatchesRecurringItem(tx.rawDescription, tx.amount, item))
  );
}

/** Whether the amount is what the item expects: its amount rule when it has one, else
 *  within a quarter (at least €1) of its amount. Only ranks candidates, never rules one out. */
function amountLooksRight(tx: BillTx, item: BillMatchItem): boolean {
  if (item.matchAmount != null || item.matchAmountMin != null || item.matchAmountMax != null) {
    return amountSatisfiesRecurringItem(tx.amount, item);
  }
  if (item.amount == null || item.amount === 0) return true;
  return Math.abs(Math.abs(tx.amount) - Math.abs(item.amount)) <= Math.max(1, Math.abs(item.amount) * 0.25);
}

export const dueKey = (itemId: number, dueDate: string) => `${itemId}|${dueDate}`;

/** A daily item, or one with neither a due day nor a start date: nothing places its
 *  payments, so callers count any payment in the month instead (and this matcher leaves
 *  it out rather than inventing dates on the 1st). */
export function hasNoDueDates(item: Pick<BillMatchItem, "frequency" | "dueDay" | "startDate">): boolean {
  return item.frequency === "daily" || (item.dueDay == null && !item.startDate);
}

export type BillPaymentMatches = {
  /** dueKey(item, date) → the transaction that paid it, for every due date in [from, to]
   *  (and the context around it) that has one. */
  byDueDate: Map<string, BillTx>;
  /** Ids of the transactions that paid a due date. */
  used: Set<number>;
};

/**
 * Pair due dates with payments. All items compete for the same transactions, so pass
 * every item that could claim one, not just the ones being shown. Candidates rank by: a
 * transaction linked to the item, then one whose amount looks right, then the nearest;
 * the best pair is settled first and neither side is used again.
 */
export function matchBillPayments(
  items: readonly BillMatchItem[],
  txs: readonly BillTx[],
  from: string,
  to: string,
  direction: DirectionOf = defaultDirection,
): BillPaymentMatches {
  const contextFrom = shiftDate(from, -MATCH_CONTEXT_DAYS);
  const contextTo = shiftDate(to, MATCH_CONTEXT_DAYS);

  type Pair = { key: string; tx: BillTx; linked: boolean; fits: boolean; distance: number };
  const pairs: Pair[] = [];
  for (const item of items) {
    if (hasNoDueDates(item)) continue;
    const dates = occurrencesBetween(item, contextFrom, contextTo);
    if (dates.length === 0) continue;
    const reach = paymentReachDays(item.frequency);
    for (const tx of txs) {
      if (!paymentFitsItem(tx, item, direction)) continue;
      const linked = tx.recurringItemId === item.id;
      const fits = amountLooksRight(tx, item);
      for (const date of dates) {
        const distance = daysBetween(date, tx.date);
        if (distance <= reach) pairs.push({ key: dueKey(item.id, date), tx, linked, fits, distance });
      }
    }
  }

  pairs.sort(
    (a, b) =>
      Number(b.linked) - Number(a.linked) ||
      Number(b.fits) - Number(a.fits) ||
      a.distance - b.distance ||
      (a.tx.date < b.tx.date ? -1 : a.tx.date > b.tx.date ? 1 : 0) ||
      a.tx.id - b.tx.id,
  );

  const byDueDate = new Map<string, BillTx>();
  const used = new Set<number>();
  for (const pair of pairs) {
    if (used.has(pair.tx.id) || byDueDate.has(pair.key)) continue;
    byDueDate.set(pair.key, pair.tx);
    used.add(pair.tx.id);
  }
  return { byDueDate, used };
}

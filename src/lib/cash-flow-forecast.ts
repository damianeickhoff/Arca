import { and, eq, gt, lte } from "drizzle-orm";
import { db } from "@/db";
import { categories, recurringItems, transactions } from "@/db/schema";
import type { RecurringItem } from "@/db/schema";
import { resolveRecurringIcon, resolveTransactionIcon } from "@/lib/auto-brand";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getBankBalances } from "@/lib/account-balances";
import { getBillStatuses } from "@/lib/bill-status";
import { getCashFlowWarningThreshold, getFinancialMonthConfig } from "@/lib/app-settings";
import { currentFinancialMonth, shiftDate, type FinancialMonthConfig } from "@/lib/date-range";
import {
  FORECAST_HORIZON_DAYS,
  forecastMessage,
  type CashFlowForecast,
  type ForecastEvent,
  type ForecastPoint,
  type ForecastStatus,
} from "@/lib/cash-flow-forecast-shared";

// Re-exported so server callers can keep importing everything forecast-related from
// here; client components must import from cash-flow-forecast-shared directly (this
// module reaches the database).
export * from "@/lib/cash-flow-forecast-shared";

// Forward-looking cash flow projection: where the money lands over the next N days
// given what Arca already knows — the live account balance, the recurring
// bills/subscriptions/debts/income that haven't happened yet, and any transactions
// already booked with a future date.
//
// The one thing this must never do is invent a starting balance. Bank balances here
// are transaction-derived (see account-balances.ts), which is only a real balance
// once at least one account has a manually-set startingBalance. Without that the
// projection starts at zero and everything downstream is *cumulative cash flow*, not
// a balance — `hasStartingBalance` is what every UI surface keys its wording off.

// ── Occurrence generation ────────────────────────────────────────────────────

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Every date this recurring item is due within [from, to], respecting its own
 * start/end period. Month-based frequencies clamp their anchor day to the length
 * of each month (a 31st bill falls on the 30th in April).
 */
function occurrencesFor(item: RecurringItem, from: string, to: string): string[] {
  const start = item.startDate && item.startDate > from ? item.startDate : from;
  const end = item.endDate && item.endDate < to ? item.endDate : to;
  if (start > end) return [];

  const dates: string[] = [];
  const push = (date: string) => {
    if (date >= start && date <= end) dates.push(date);
  };

  const anchorDay = item.dueDay ?? (item.startDate ? Number(item.startDate.slice(8, 10)) : 1);

  switch (item.frequency) {
    case "once": {
      if (item.startDate) push(item.startDate);
      break;
    }
    case "daily": {
      for (let cursor = start; cursor <= end; cursor = shiftDate(cursor, 1)) push(cursor);
      break;
    }
    case "weekly": {
      // Walk forward from the anchor (the item's own start date when it has one, so
      // the weekday is preserved) rather than from `start`.
      let cursor = item.startDate ?? start;
      while (cursor < start) cursor = shiftDate(cursor, 7);
      for (; cursor <= end; cursor = shiftDate(cursor, 7)) push(cursor);
      break;
    }
    case "quarterly":
    case "yearly":
    case "monthly":
    default: {
      const step = item.frequency === "quarterly" ? 3 : item.frequency === "yearly" ? 12 : 1;
      // For multi-month steps the anchor month matters (a quarterly bill starting in
      // February is due Feb/May/Aug/Nov); monthly items are due every month regardless.
      const anchorMonth = item.startDate ? Number(item.startDate.slice(5, 7)) : 1;
      const anchorYear = item.startDate ? Number(item.startDate.slice(0, 4)) : Number(from.slice(0, 4));

      let year = Number(from.slice(0, 4));
      let month = Number(from.slice(5, 7));
      if (step > 1) {
        // Snap to the first anchor-aligned month at or after `from`.
        const fromIndex = year * 12 + (month - 1);
        const anchorIndex = anchorYear * 12 + (anchorMonth - 1);
        const stepsAhead = Math.max(0, Math.ceil((fromIndex - anchorIndex) / step));
        const index = anchorIndex + stepsAhead * step;
        year = Math.floor(index / 12);
        month = (index % 12) + 1;
      }

      // +1 month of slack so an occurrence landing right after `to`'s month start
      // isn't missed when the anchor day is early in the month.
      while (iso(year, month, 1) <= end) {
        push(iso(year, month, Math.min(anchorDay, daysInMonth(year, month))));
        month += step;
        while (month > 12) {
          month -= 12;
          year += 1;
        }
      }
      break;
    }
  }

  return dates;
}

// ── Forecast ─────────────────────────────────────────────────────────────────

export async function getCashFlowForecast(
  financialMonthConfig?: FinancialMonthConfig,
  horizonDays = FORECAST_HORIZON_DAYS,
): Promise<CashFlowForecast> {
  const financialMonth = financialMonthConfig ?? (await getFinancialMonthConfig());

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const from = shiftDate(today, 1);
  const to = shiftDate(today, horizonDays);

  const [bankBalances, threshold, items, cats, futureTx, billStatuses] = await Promise.all([
    getBankBalances(),
    getCashFlowWarningThreshold(),
    db.select().from(recurringItems).where(and(eq(recurringItems.active, true), eq(recurringItems.dismissed, false))),
    db.select({ id: categories.id, icon: categories.icon, color: categories.color, group: categories.group }).from(categories),
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        direction: transactions.direction,
        amount: transactions.amount,
        correctedAmount: transactions.correctedAmount,
        description: transactions.description,
        customName: transactions.customName,
        brandIcon: transactions.brandIcon,
        brandIconColor: transactions.brandIconColor,
        brandIconBgColor: transactions.brandIconBgColor,
        categoryIcon: categories.icon,
        categoryColor: categories.color,
        recurringItemId: transactions.recurringItemId,
        isInternalTransfer: isInternalTransferExpr,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(gt(transactions.date, today), lte(transactions.date, to)))
      .orderBy(transactions.date),
    getBillStatuses(currentFinancialMonth(financialMonth), financialMonth),
  ]);

  // A real starting balance only exists once the user has told Arca what an account
  // actually held at some point — otherwise the "balance" is just summed history.
  const hasStartingBalance = bankBalances.some((b) => b.startingBalance != null);
  const current = hasStartingBalance ? bankBalances.reduce((sum, b) => sum + b.balance, 0) : 0;

  const categoriesById = new Map(cats.map((c) => [c.id, { icon: c.icon, color: c.color }]));
  const groupById = new Map(cats.map((c) => [c.id, c.group]));

  const events: ForecastEvent[] = [];

  // 1. Already-booked future transactions. Internal transfers move money between the
  //    user's own accounts, so they net to zero against the combined balance.
  const bookedRecurringMonths = new Set<string>();
  for (const row of futureTx) {
    if (row.isInternalTransfer) continue;
    const amount = row.correctedAmount ?? row.amount;
    const name = row.customName ?? row.description;
    const resolved = resolveTransactionIcon(row);
    if (row.recurringItemId != null) bookedRecurringMonths.add(`${row.recurringItemId}|${row.date.slice(0, 7)}`);
    events.push({
      key: `tx-${row.id}`,
      date: row.date,
      name,
      amount: row.direction === "income" ? amount : -amount,
      kind: "transaction",
      transactionId: row.id,
      recurringItemId: row.recurringItemId,
      icon: resolved.iconKey ?? null,
      iconColor: resolved.color,
      iconBackground: resolved.background,
    });
  }

  // 2. Projected recurring occurrences. Two double-count guards: an item already paid
  //    this financial month (matched or manually marked), and an item that already has
  //    a booked future transaction in the same calendar month.
  const paidThisMonth = new Set(billStatuses.filter((s) => s.paid === true).map((s) => s.item.id));
  const currentMonthKey = today.slice(0, 7);

  for (const item of items) {
    if (item.amount == null || item.amount === 0) continue;
    const isIncome = item.type === "income" || (item.categoryId != null && groupById.get(item.categoryId) === "income");
    const resolved = resolveRecurringIcon(item, categoriesById);

    for (const date of occurrencesFor(item, from, to)) {
      const monthKey = date.slice(0, 7);
      if (monthKey === currentMonthKey && paidThisMonth.has(item.id)) continue;
      if (bookedRecurringMonths.has(`${item.id}|${monthKey}`)) continue;
      events.push({
        key: `rec-${item.id}-${date}`,
        date,
        name: item.friendlyName ?? item.name,
        amount: isIncome ? item.amount : -item.amount,
        kind: "recurring",
        transactionId: null,
        recurringItemId: item.id,
        icon: resolved.iconKey ?? null,
        iconColor: resolved.color,
        iconBackground: resolved.background,
      });
    }
  }

  events.sort((a, z) => (a.date === z.date ? z.amount - a.amount : a.date < z.date ? -1 : 1));

  // 3. Daily projection: starting amount + income − expenses, day by day.
  const changeByDate = new Map<string, number>();
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const event of events) {
    changeByDate.set(event.date, (changeByDate.get(event.date) ?? 0) + event.amount);
    if (event.amount >= 0) totalIncome += event.amount;
    else totalExpenses += -event.amount;
  }

  const points: ForecastPoint[] = [{ date: today, amount: current, change: 0 }];
  let running = current;
  let lowest: { amount: number; date: string } = { amount: current, date: today };
  let firstNegativeDate: string | null = current < 0 ? today : null;

  for (let cursor = from; cursor <= to; cursor = shiftDate(cursor, 1)) {
    const change = changeByDate.get(cursor) ?? 0;
    running += change;
    points.push({ date: cursor, amount: running, change });
    if (running < lowest.amount) lowest = { amount: running, date: cursor };
    if (firstNegativeDate == null && running < 0) firstNegativeDate = cursor;
  }

  const nextIncome = events.find((e) => e.amount > 0) ?? null;

  // Nothing to project from — no known balance and no future movement — so the flat
  // zero line is an absence of data, not a cash flow problem. Scoring it would warn
  // every fresh install that it drops below the threshold "today".
  const hasAnything = hasStartingBalance || events.length > 0;

  const status: ForecastStatus = !hasAnything
    ? "empty"
    : lowest.amount < 0
      ? "critical"
      : lowest.amount < threshold
        ? "warning"
        : "healthy";

  return {
    from: today,
    to,
    hasStartingBalance,
    current,
    points,
    events,
    // A "lowest point" on a flat line nobody has data for is noise — the detail page
    // renders an em dash for it instead.
    lowest: hasAnything ? lowest : null,
    firstNegativeDate,
    nextIncome,
    totalIncome,
    totalExpenses,
    netChange: totalIncome - totalExpenses,
    warningThreshold: threshold,
    status,
    message: await forecastMessage({ status, lowest, firstNegativeDate, threshold, points }),
  };
}

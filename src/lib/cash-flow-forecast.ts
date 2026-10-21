import { and, eq, gt, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { categories, recurringItems, transactions } from "@/db/schema";
import { resolveRecurringIcon, resolveTransactionIcon } from "@/lib/auto-brand";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getBankBalances } from "@/lib/account-balances";
import { getBillStatuses } from "@/lib/bill-status";
import { getCashFlowWarningThreshold, getFinancialMonthConfig, getOverdraftMode } from "@/lib/app-settings";
import { currentFinancialMonth, shiftDate, type FinancialMonthConfig } from "@/lib/date-range";
import { occurrencesBetween } from "@/lib/recurring-occurrence";
import {
  FORECAST_HORIZON_DAYS,
  firstShortPoint,
  judgeForecast,
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

  const [bankBalances, threshold, overdraftMode, items, cats, futureTx, billStatuses] = await Promise.all([
    getBankBalances(),
    getCashFlowWarningThreshold(),
    getOverdraftMode(),
    // Items starting later are switched off until then (syncRecurringLifecycle), but their
    // occurrences inside the horizon are real — a payment plan whose first part is next month.
    db
      .select()
      .from(recurringItems)
      .where(and(eq(recurringItems.dismissed, false), or(eq(recurringItems.active, true), gt(recurringItems.startDate, today)))),
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
    // Skipped occurrences ("Skip October") included, so they can count as settled below.
    getBillStatuses(currentFinancialMonth(financialMonth), financialMonth, undefined, { includeSkipped: true }),
  ]);

  // A real starting balance only exists once the user has told Arca what an account
  // actually held at some point — otherwise the "balance" is just summed history.
  const hasStartingBalance = bankBalances.some((b) => b.startingBalance != null);
  const current = hasStartingBalance ? bankBalances.reduce((sum, b) => sum + b.balance, 0) : 0;
  // The projection is one combined line, so the room below zero is every account's
  // overdraft together. Without a real balance there is nothing for a limit to apply to.
  const overdraftLimit = hasStartingBalance ? bankBalances.reduce((sum, b) => sum + (b.overdraftLimit ?? 0), 0) : 0;
  const floor = { overdraftLimit, overdraftMode };

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
  // Weekly and four-weekly items have a status per due date: a paid date is skipped on
  // its own, and once every date this month is paid the whole month is.
  // A skipped month counts as settled: nothing leaves the account for it.
  const settled = (s: (typeof billStatuses)[number]) => s.paid === true || s.skipped;
  const paidDates = new Set(billStatuses.filter((s) => settled(s) && s.dueDate).map((s) => `${s.item.id}|${s.dueDate}`));
  const unpaidItems = new Set(billStatuses.filter((s) => !settled(s)).map((s) => s.item.id));
  const paidThisMonth = new Set(billStatuses.filter((s) => settled(s) && !unpaidItems.has(s.item.id)).map((s) => s.item.id));
  const currentMonthKey = today.slice(0, 7);

  for (const item of items) {
    if (item.amount == null || item.amount === 0) continue;
    const isIncome = item.type === "income" || (item.categoryId != null && groupById.get(item.categoryId) === "income");
    const resolved = resolveRecurringIcon(item, categoriesById);

    for (const date of occurrencesBetween(item, from, to)) {
      const monthKey = date.slice(0, 7);
      if (paidDates.has(`${item.id}|${date}`)) continue;
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

  for (let cursor = from; cursor <= to; cursor = shiftDate(cursor, 1)) {
    const change = changeByDate.get(cursor) ?? 0;
    running += change;
    points.push({ date: cursor, amount: running, change });
    if (running < lowest.amount) lowest = { amount: running, date: cursor };
  }

  const nextIncome = events.find((e) => e.amount > 0) ?? null;

  // Nothing to project from — no known balance and no future movement — so the flat
  // zero line is an absence of data, not a cash flow problem. Scoring it would warn
  // every fresh install that it drops below the threshold "today".
  const hasAnything = hasStartingBalance || events.length > 0;

  const status: ForecastStatus = hasAnything ? judgeForecast(lowest.amount, threshold, floor).status : "empty";

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
    firstShortDate: firstShortPoint(points, overdraftLimit)?.date ?? null,
    nextIncome,
    totalIncome,
    totalExpenses,
    netChange: totalIncome - totalExpenses,
    warningThreshold: threshold,
    status,
    ...floor,
  };
}

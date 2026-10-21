import { db } from "@/db";
import { banks, goals, savingsGoals, transactions, vermogenAccounts, vermogenAccountValues } from "@/db/schema";
import { and, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { getBankBalances } from "@/lib/account-balances";
import { getBillStatuses } from "@/lib/bill-status";
import { getDebtRecurringLinks } from "@/lib/debt-recurring-paid";
import { getNetWorthForecast } from "@/lib/net-worth-forecast";
import { currentFinancialMonth, financialMonthRangeByMonth, todayStr, type FinancialMonthConfig } from "@/lib/date-range";
import {
  addDays,
  balanceSeries,
  biggestStep,
  contributionSeries,
  isStale,
  manualHistory,
  monthsBack,
  rangeMonthCount,
  sampleDates,
  stackSeries,
  stepSeries,
  whatChanged,
  type AssetKind,
  type ChangeGroup,
  type NetWorthRange,
} from "@/lib/net-worth-history";
import { loadDebtsData } from "@/app/debts/load-debts";
import { debtBalance } from "@/app/debts/debt-shared";

export type AccountSource = "synced" | "entered" | "plan" | "debts";

export interface NetWorthAccount {
  key: string;
  name: string;
  side: "asset" | "debt";
  kind: AssetKind;
  source: AccountSource;
  /** Which kind of row it is, for its meta line. */
  type: "bank" | "manual" | "goal" | "owed" | "debt";
  icon: string | null;
  color: string | null;
  /** One value per chart date (a debt's balance owed, positive). */
  values: number[];
  start: number;
  end: number;
  /** Value at the start of the budget month (for What changed). */
  monthStart: number;
  href: string;
  group: ChangeGroup;
  // Per type, for the meta line:
  cardType?: string | null;
  accountNumber?: string | null;
  manualType?: string;
  lastUpdated?: string | null;
  stale?: boolean;
  monthlyContribution?: number | null;
  lastContribution?: string | null;
  minimumPayment?: number;
  interestRate?: number | null;
  payoffDate?: string | null;
  neverPaysOff?: boolean;
}

// The kind of value a hand-kept account holds (vermogen_accounts.type).
function manualKind(type: string): AssetKind {
  return type === "beleggingen" ? "investments" : type === "spaarrekening" || type === "betaalrekening" ? "cash" : "things";
}

/** The newest imported or synced row on these accounts ("Synced ones follow your imports · last 20 Oct"). */
async function lastImportDate(accountNumbers: string[]): Promise<string | null> {
  if (accountNumbers.length === 0) return null;
  const [row] = await db
    .select({ date: sql<string | null>`MAX(${transactions.date})` })
    .from(transactions)
    .where(and(inArray(transactions.source, ["csv_import", "bank"]), inArray(transactions.account, accountNumbers)));
  return row?.date ?? null;
}

/** The hand-kept values for Update balances, largest first, with whether each is stale. */
function toManualValues(rows: (typeof vermogenAccounts.$inferSelect)[], today: string) {
  return rows
    .map((a) => ({ id: a.id, name: a.name, value: a.value, lastUpdated: a.lastUpdated, stale: isStale(a.lastUpdated, today) }))
    .sort((a, b) => b.value - a.value);
}

/** Just what the heading's Update balances button needs, without the whole page's history. */
export async function loadManualValues() {
  const today = todayStr();
  const [rows, bankRows] = await Promise.all([
    db.select().from(vermogenAccounts).where(and(eq(vermogenAccounts.active, true), eq(vermogenAccounts.includeInNetWorth, true))),
    db.select({ accountNumber: banks.accountNumber }).from(banks).where(eq(banks.includeInNetWorth, true)),
  ]);
  const lastImport = await lastImportDate(bankRows.map((b) => b.accountNumber).filter((n): n is string => !!n));
  return { today, items: toManualValues(rows, today), lastImport };
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Everything Insights › Net worth draws: every account with its value on each chart
 * date (rebuilt from transactions, entered values, goal contributions and the debts'
 * own maths; see lib/net-worth-history.ts), the stacked totals, what changed since the
 * budget month started, the hand-kept values and where the total is heading.
 */
export async function loadNetWorth(range: NetWorthRange, financialMonth: FinancialMonthConfig) {
  const today = todayStr();
  const start = monthsBack(today, rangeMonthCount(range));
  const dates = sampleDates(start, today, 13);
  const current = currentFinancialMonth(financialMonth);
  const monthFrom = financialMonthRangeByMonth(current, financialMonth).from;
  const monthBase = addDays(monthFrom, -1);
  const allDates = [...new Set([...dates, monthBase])].sort();
  const earliest = allDates[0];
  const at = (values: number[]) => ({
    series: dates.map((d) => values[allDates.indexOf(d)]),
    monthStart: values[allDates.indexOf(monthBase)],
  });

  const [bankRows, manualRows, legacyGoals, savingGoals, debtsData, links] = await Promise.all([
    getBankBalances(),
    db.select().from(vermogenAccounts).where(and(eq(vermogenAccounts.active, true), eq(vermogenAccounts.includeInNetWorth, true))),
    db.select().from(savingsGoals).where(eq(savingsGoals.active, true)),
    db.select().from(goals).where(and(eq(goals.active, true), eq(goals.goalType, "savings"))),
    loadDebtsData(),
    getDebtRecurringLinks(financialMonth),
  ]);
  const netWorthBanks = bankRows.filter((b) => b.includeInNetWorth);

  // Synced accounts: what moved per day after the earliest date (the starting-balance
  // rule of lib/account-balances: rows on or before the starting date are in it already).
  const signedFlow = sql<number>`SUM(CASE
    WHEN ${banks.startingDate} IS NOT NULL AND ${transactions.date} <= ${banks.startingDate} THEN 0
    WHEN ${transactions.direction} = 'income' THEN ${transactions.amount}
    ELSE -${transactions.amount}
  END)`;
  const bankIds = netWorthBanks.map((b) => b.id);
  const bankNumbers = netWorthBanks.map((b) => b.accountNumber).filter((n): n is string => !!n);
  const [flowRows, valueRows, contributionRows, lastImport] = await Promise.all([
    bankIds.length
      ? db
          .select({ bankId: banks.id, date: transactions.date, amount: signedFlow })
          .from(transactions)
          .innerJoin(banks, eq(transactions.account, banks.accountNumber))
          .where(and(inArray(banks.id, bankIds), gt(transactions.date, earliest)))
          .groupBy(banks.id, transactions.date)
      : [],
    manualRows.length
      ? db.select().from(vermogenAccountValues).where(inArray(vermogenAccountValues.accountId, manualRows.map((a) => a.id)))
      : [],
    savingGoals.length
      ? db
          .select({
            goalId: transactions.goalId,
            date: transactions.date,
            amount: sql<number>`SUM(CASE WHEN ${transactions.direction} = 'income' THEN -${transactions.amount} ELSE ${transactions.amount} END)`,
          })
          .from(transactions)
          .where(and(isNotNull(transactions.goalId), inArray(transactions.goalId, savingGoals.map((g) => g.id)), gt(transactions.date, earliest)))
          .groupBy(transactions.goalId, transactions.date)
      : [],
    lastImportDate(bankNumbers),
  ]);

  const accounts: NetWorthAccount[] = [];

  for (const b of netWorthBanks) {
    const flows = flowRows.filter((f) => f.bankId === b.id).map((f) => ({ date: f.date, amount: Number(f.amount) || 0 }));
    const { series, monthStart } = at(balanceSeries(b.balance, flows, allDates));
    accounts.push({
      key: `bank-${b.id}`,
      name: b.displayName ?? b.accountNumber ?? "",
      side: "asset",
      kind: "cash",
      source: "synced",
      type: "bank",
      icon: b.icon,
      color: b.color,
      values: series,
      start: series[0],
      end: b.balance,
      monthStart,
      href: b.accountNumber ? `/transactions?account=${encodeURIComponent(b.accountNumber)}` : "/settings?panel=accounts",
      group: "cash",
      cardType: b.cardType,
      accountNumber: b.accountNumber,
    });
  }

  let step: { name: string; kind: AssetKind; date: string } | null = null;
  let stepSize = 0;
  for (const a of manualRows) {
    const history = manualHistory(
      valueRows.filter((v) => v.accountId === a.id).map((v) => ({ date: v.date, value: v.value })),
      { value: a.value, lastUpdated: a.lastUpdated },
      today,
    );
    const { series, monthStart } = at(stepSeries(history, allDates));
    const kind = manualKind(a.type);
    const s = biggestStep(history, start, today);
    if (s && Math.abs(s.delta) > stepSize) {
      stepSize = Math.abs(s.delta);
      step = { name: a.name, kind, date: s.date };
    }
    accounts.push({
      key: `manual-${a.id}`,
      name: a.name,
      side: "asset",
      kind,
      source: "entered",
      type: "manual",
      icon: a.icon,
      color: a.color,
      values: series,
      start: series[0],
      end: a.value,
      monthStart,
      href: "#update-balances",
      group: "manual",
      manualType: a.type,
      lastUpdated: a.lastUpdated,
      stale: isStale(a.lastUpdated, today),
    });
  }

  for (const g of legacyGoals) {
    accounts.push({
      key: `legacy-goal-${g.id}`,
      name: g.name,
      side: "asset",
      kind: "cash",
      source: "plan",
      type: "goal",
      icon: g.icon,
      color: g.color,
      values: dates.map(() => g.currentAmount),
      start: g.currentAmount,
      end: g.currentAmount,
      monthStart: g.currentAmount,
      href: "/goals",
      group: "contributions",
      monthlyContribution: g.monthlyContribution,
    });
  }
  for (const g of savingGoals) {
    const contributions = contributionRows.filter((c) => c.goalId === g.id).map((c) => ({ date: c.date, amount: Number(c.amount) || 0 }));
    const { series, monthStart } = at(contributionSeries(g.currentAmount, contributions, allDates));
    accounts.push({
      key: `goal-${g.id}`,
      name: g.name,
      side: "asset",
      kind: "cash",
      source: "plan",
      type: "goal",
      icon: g.icon,
      color: g.color,
      values: series,
      start: series[0],
      end: g.currentAmount,
      monthStart,
      href: "/goals",
      group: "contributions",
      monthlyContribution: g.monthlyContribution,
      lastContribution: contributions.filter((c) => c.date >= monthFrom && c.amount > 0).map((c) => c.date).sort().at(-1) ?? null,
    });
  }

  // Debts, both ways, with the Debts page's own balance maths at each date.
  const balanceOn = (debt: (typeof debtsData.computed)[number]["debt"]) =>
    allDates.map((d) => Math.max(0, debtBalance(debt, links.paidFor(debt, d.slice(0, 7)), new Date(`${d}T12:00:00`)).currentBalance));
  for (const c of debtsData.computedOwed) {
    const { series, monthStart } = at(balanceOn(c.debt));
    if (Math.max(...series, c.currentBalance) <= 0) continue;
    accounts.push({
      key: `owed-${c.debt.id}`,
      name: c.debt.name,
      side: "asset",
      kind: "cash",
      source: "debts",
      type: "owed",
      icon: c.debt.icon,
      color: c.debt.color,
      values: series,
      start: series[0],
      end: c.currentBalance,
      monthStart,
      href: "/debts",
      group: "debts",
    });
  }
  for (const c of debtsData.computed) {
    const { series, monthStart } = at(balanceOn(c.debt));
    if (Math.max(...series, c.currentBalance) <= 0) continue;
    accounts.push({
      key: `debt-${c.debt.id}`,
      name: c.debt.name,
      side: "debt",
      kind: "cash",
      source: "debts",
      type: "debt",
      icon: c.debt.icon,
      color: c.debt.color,
      values: series,
      start: series[0],
      end: c.currentBalance,
      monthStart,
      href: "/debts",
      group: "debts",
      minimumPayment: c.debt.minimumPayment,
      interestRate: c.debt.interestRate,
      payoffDate: c.lastPaymentDate ? ymd(c.lastPaymentDate) : null,
      neverPaysOff: c.neverPaysOff,
    });
  }

  // Today's values are the live ones, so the last point is exactly the figure above it.
  for (const a of accounts) a.values[a.values.length - 1] = a.end;
  accounts.sort((x, y) => (x.side === y.side ? y.end - x.end : x.side === "asset" ? -1 : 1));

  const stacked = stackSeries(accounts, dates.length);
  const assets = stacked.assets.at(-1) ?? 0;
  const debts = stacked.debts.at(-1) ?? 0;
  const netWorth = stacked.net.at(-1) ?? 0;

  const changes = whatChanged(
    accounts.map((a) => ({ key: a.key, group: a.group, start: a.monthStart, end: a.end, owed: a.side === "debt" })),
  );

  const [forecast, incomeStatuses] = await Promise.all([
    getNetWorthForecast(netWorth, today),
    getBillStatuses(current, financialMonth, ["income"]),
  ]);
  const pendingIncome = incomeStatuses
    .filter((s) => s.dueDate != null && (s.paid === false || (s.paid === null && s.dueDate >= today)))
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .map((s) => ({ name: s.item.name, amount: s.item.amount ?? 0, dueDate: s.dueDate! }));

  return {
    today,
    start,
    dates,
    current,
    monthStartDate: monthFrom,
    monthTo: financialMonthRangeByMonth(current, financialMonth).to,
    accounts,
    stacked,
    assets,
    debts,
    netWorth,
    changes,
    step,
    projection: forecast.at(-1) ?? null,
    pendingIncome,
    lastImport,
    manual: toManualValues(manualRows, today),
    empty: accounts.length === 0,
  };
}

export type NetWorthData = Awaited<ReturnType<typeof loadNetWorth>>;

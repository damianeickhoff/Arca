import { db } from "@/db";
import { categories, merchants, transactions } from "@/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { reimbursedAmountExpr } from "@/lib/reimbursed-amount";
import { getBudgetStrategy, getSharedCostMode } from "@/lib/app-settings";
import { getBillStatuses } from "@/lib/bill-status";
import { currentFinancialMonth, financialMonthForDate, financialMonthRangeByMonth, todayStr, type FinancialMonthConfig } from "@/lib/date-range";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { normalizeBudgetType } from "@/lib/format";
import {
  biggestMovers,
  categoryMonthly,
  categoryTrend,
  classifyRow,
  dominantMerchant,
  fromFirstData,
  hasData,
  incomeStandsOut,
  keptSummary,
  monthFlows,
  monthsBefore,
  planSplit,
  trendsMonths,
  type CategoryTrend,
  type TrendsRange,
  type TrendsRow,
} from "@/lib/trends";

export interface TrendsCategory {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  group: "needs" | "wants";
  trend: CategoryTrend;
  /** Share of all spending in the period, whole percent. */
  share: number;
  /** The one or two merchants most of it went to. */
  merchants: string[];
  /** A bill in this category still due in the running month (its date), when nothing was spent yet. */
  dueDate: string | null;
}

export interface MonthStats {
  income: number;
  expense: number;
  topCats: { id: number; name: string; color: string | null; icon: string | null; total: number }[];
}

/**
 * Everything Insights › Trends draws, per budget month: the months in the period and
 * the ones before it, money in and out, the key figures, the categories with their
 * trend and the biggest movers, and the two months the comparison dialog shows.
 */
export async function loadTrends({
  range,
  cmpA,
  cmpB,
  categoryIds,
  accounts,
  financialMonth,
}: {
  range: TrendsRange;
  cmpA?: string;
  cmpB?: string;
  categoryIds?: number[];
  accounts?: string[];
  financialMonth: FinancialMonthConfig;
}) {
  const current = currentFinancialMonth(financialMonth);
  // The period's months and as many before it; both are trimmed to the months that
  // have data once the rows are in (see fromFirstData).
  const window = trendsMonths(range, current, financialMonth);
  const windowBefore = monthsBefore(window);
  const running = window.at(-1) === current ? current : null;
  const startDate = financialMonthRangeByMonth(windowBefore[0], financialMonth).from;
  const endDate = financialMonthRangeByMonth(window.at(-1)!, financialMonth).to;
  const today = todayStr();

  const [allCats, strategy, netReimbursements, [anyTransaction]] = await Promise.all([
    db.select().from(categories),
    getBudgetStrategy(),
    getSharedCostMode().then((mode) => mode === "net"),
    db.select({ id: transactions.id }).from(transactions).limit(1),
  ]);
  const catById = new Map(allCats.map((c) => [c.id, c]));

  let txRows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      direction: transactions.direction,
      amount: transactions.amount,
      correctedAmount: transactions.correctedAmount,
      reimbursedAmount: reimbursedAmountExpr,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      categoryGroup: categories.group,
      budgetTypeOverride: transactions.budgetTypeOverride,
      account: transactions.account,
      isReimbursement: transactions.isReimbursement,
      isInternalTransfer: isInternalTransferExpr,
      recurringItemId: transactions.recurringItemId,
      description: transactions.description,
      customName: transactions.customName,
      merchantName: merchants.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(and(gte(transactions.date, startDate), lte(transactions.date, endDate)))
    .orderBy(asc(transactions.date), asc(transactions.id));

  // The heading's Categories / Accounts filters (same convention as Overview).
  if (categoryIds?.length) txRows = txRows.filter((r) => r.categoryId != null && categoryIds.includes(r.categoryId));
  if (accounts?.length) txRows = txRows.filter((r) => r.account != null && accounts.includes(r.account));
  const txById = new Map(txRows.map((r) => [r.id, r]));

  const splitMap = groupTransactionSplits(await getTransactionSplitRows(txRows.map((r) => r.id)));
  const allocations = buildSplitAllocations(txRows, splitMap, { netReimbursements });

  // Which budget month a date belongs to (many rows share a date).
  const monthByDate = new Map<string, string>();
  const monthOf = (date: string) => {
    let m = monthByDate.get(date);
    if (m === undefined) {
      m = financialMonthForDate(date, financialMonth);
      monthByDate.set(date, m);
    }
    return m;
  };

  const rows: (TrendsRow & { transactionId: number })[] = allocations.map((a) => {
    const tx = txById.get(a.transactionId);
    const split = (splitMap.get(a.transactionId)?.length ?? 0) > 0;
    return {
      transactionId: a.transactionId,
      month: monthOf(a.date),
      direction: a.direction,
      amount: a.amount,
      categoryId: a.categoryId,
      categoryGroup: a.categoryGroup,
      budgetType: (!split ? tx?.budgetTypeOverride : null) ?? (a.categoryId != null ? (catById.get(a.categoryId)?.budgetType ?? null) : null),
      isReimbursement: a.isReimbursement,
      isInternalTransfer: a.isInternalTransfer,
    };
  });

  const flows = fromFirstData(monthFlows(rows, window));
  const months = flows.map((f) => f.month);
  // Only the months before that have data count, so a short history isn't diluted.
  const beforeFlows = monthFlows(rows, windowBefore).filter(hasData);
  const before = beforeFlows.map((f) => f.month);
  const hasBefore = beforeFlows.some((f) => f.expense > 0);
  const summary = keptSummary(flows, running);
  const split = planSplit(summary.basis, strategy);
  const finishedMonths = new Set(summary.basis.map((f) => f.month));

  // What made the highest income month stand out: its largest one-off payment.
  let incomeNote: { month: string; name: string } | null = null;
  if (summary.peakIncome && incomeStandsOut(summary.basis, summary.peakIncome)) {
    const peakMonth = summary.peakIncome.month;
    const top = rows
      .filter((r) => r.month === peakMonth && classifyRow(r) === "income" && txById.get(r.transactionId)?.recurringItemId == null)
      .sort((a, b) => b.amount - a.amount)[0];
    const tx = top ? txById.get(top.transactionId) : null;
    const name = tx ? (tx.customName ?? tx.merchantName ?? tx.description) : null;
    if (name) incomeNote = { month: peakMonth, name };
  }

  // The running month: income still expected and bills still due (bills carry no
  // account, so an account filter leaves them out).
  const filtered = !!categoryIds?.length || !!accounts?.length;
  const [incomeStatuses, billStatuses] = running && !filtered
    ? await Promise.all([getBillStatuses(running, financialMonth, ["income"]), getBillStatuses(running, financialMonth)])
    : [[], []];
  // Known unpaid, or not matched yet with its date still to come (the Budget page's rule).
  const stillDue = (s: (typeof incomeStatuses)[number]) => s.dueDate != null && (s.paid === false || (s.paid === null && s.dueDate >= today));
  const pendingIncome = incomeStatuses
    .filter(stillDue)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .map((s) => ({ name: s.item.name, amount: s.item.amount ?? 0, dueDate: s.dueDate! }));
  const dueByCategory = new Map<number, string>();
  for (const s of billStatuses) {
    if (s.item.type === "savings" || s.item.categoryId == null || !stillDue(s)) continue;
    const known = dueByCategory.get(s.item.categoryId);
    if (!known || s.dueDate! < known) dueByCategory.set(s.item.categoryId, s.dueDate!);
  }

  // Categories, each on its own (a sub-category is not merged into its group).
  const monthly = categoryMonthly(rows, months);
  const beforeMonthly = categoryMonthly(rows, before);
  const totalExpense = flows.reduce((s, f) => s + f.expense, 0);
  const merchantSpend = new Map<number, Map<string, number>>();
  const afterEntries = new Map<number, { merchant: string | null; amount: number }[]>();
  for (const r of rows) {
    if (r.categoryId == null || !monthly.has(r.categoryId)) continue;
    const kind = classifyRow(r);
    if (kind !== "needs" && kind !== "wants") continue;
    const merchant = txById.get(r.transactionId)?.merchantName ?? null;
    if (months.includes(r.month) && merchant) {
      const m = merchantSpend.get(r.categoryId) ?? new Map<string, number>();
      m.set(merchant, (m.get(merchant) ?? 0) + r.amount);
      merchantSpend.set(r.categoryId, m);
    }
    if (finishedMonths.has(r.month)) afterEntries.set(r.categoryId, [...(afterEntries.get(r.categoryId) ?? []), { merchant, amount: r.amount }]);
  }

  const cats: TrendsCategory[] = [...monthly.entries()]
    .map(([id, values]) => {
      const c = catById.get(id);
      const beforeTotal = Object.values(beforeMonthly.get(id) ?? {}).reduce((s, v) => s + v, 0);
      const trend = categoryTrend(values, months, running, beforeTotal, before.length);
      const topMerchants = [...(merchantSpend.get(id)?.entries() ?? [])].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([name]) => name);
      return {
        id,
        name: c?.name ?? "",
        color: c?.color ?? null,
        icon: c?.icon ?? null,
        group: normalizeBudgetType(c?.budgetType) === "nodig" ? ("needs" as const) : ("wants" as const),
        trend,
        share: totalExpense > 0 ? Math.min(100, Math.round((trend.total / totalExpense) * 100)) : 0,
        merchants: topMerchants,
        dueDate: trend.current === 0 ? (dueByCategory.get(id) ?? null) : null,
      };
    })
    .filter((c) => c.trend.total > 0)
    .sort((a, b) => b.trend.total - a.trend.total);

  // Categories that only had spending before the period moved down to nothing.
  const gone = [...beforeMonthly.entries()]
    .filter(([id]) => !monthly.has(id))
    .map(([id, values]) => ({ id, name: catById.get(id)?.name ?? "", after: 0, before: Object.values(values).reduce((s, v) => s + v, 0) / before.length }));
  const movers = hasBefore
    ? biggestMovers([...cats.map((c) => ({ id: c.id, name: c.name, after: c.trend.avg, before: c.trend.avg - c.trend.vsBefore })), ...gone])
    : null;
  const moverReason = (id: number) => dominantMerchant(afterEntries.get(id) ?? []);

  // The comparison dialog: any two started months that are loaded, top-level categories.
  const pickable = [...windowBefore, ...window].filter((m) => m <= current);
  const latest = months.at(-1)!;
  const resolvedA = cmpA && pickable.includes(cmpA) ? cmpA : latest;
  const resolvedB = cmpB && pickable.includes(cmpB) && cmpB !== resolvedA ? cmpB : (pickable[pickable.indexOf(resolvedA) - 1] ?? windowBefore.at(-1)!);
  const rollupId = (id: number) => catById.get(id)?.parentCategoryId ?? id;
  const statsFor = (ym: string): MonthStats => {
    let income = 0;
    let expense = 0;
    const byCat = new Map<number, MonthStats["topCats"][number]>();
    for (const r of rows) {
      if (r.month !== ym) continue;
      const kind = classifyRow(r);
      if (kind === "income") income += r.amount;
      if (kind !== "needs" && kind !== "wants") continue;
      expense += r.amount;
      if (r.categoryId == null) continue;
      const rid = rollupId(r.categoryId);
      const c = catById.get(rid);
      const entry = byCat.get(rid) ?? { id: rid, name: c?.name ?? "", color: c?.color ?? null, icon: c?.icon ?? null, total: 0 };
      entry.total += r.amount;
      byCat.set(rid, entry);
    }
    return { income, expense, topCats: [...byCat.values()].sort((a, b) => b.total - a.total).slice(0, 8) };
  };

  return {
    hasAnyTransaction: !!anyTransaction,
    months,
    before,
    current,
    running,
    flows,
    summary,
    split,
    strategy,
    incomeNote,
    pendingIncome,
    totalExpense,
    uncategorised: flows.reduce((s, f) => s + f.expense, 0) - cats.reduce((s, c) => s + c.trend.total, 0),
    categories: cats,
    movers: movers && {
      up: movers.up.map((m) => ({ ...m, reason: moverReason(m.id) })),
      down: movers.down.map((m) => ({ ...m, reason: moverReason(m.id) })),
      net: movers.net,
    },
    comparison: {
      cmpA: resolvedA,
      cmpB: resolvedB,
      pickable,
      statsA: statsFor(resolvedA),
      statsB: statsFor(resolvedB),
      runningBills: running && (resolvedA === running || resolvedB === running)
        ? billStatuses.filter((s) => s.item.type !== "savings" && stillDue(s)).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)).map((s) => ({ name: s.item.name, amount: s.item.amount ?? 0 }))
        : null,
    },
  };
}

export type TrendsData = Awaited<ReturnType<typeof loadTrends>>;

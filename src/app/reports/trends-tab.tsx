import { db } from "@/db";
import { transactions, categories } from "@/db/schema";
import { eq, and, gte, asc } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { IconChartBar, IconCoins, IconShoppingBag, IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import { normalizeBudgetType, formatEurWhole } from "@/lib/format";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { reimbursedAmountExpr } from "@/lib/reimbursed-amount";
import { getBudgetStrategy, getSharedCostMode } from "@/lib/app-settings";
import { getBillStatuses } from "@/lib/bill-status";
import {
  currentFinancialMonth,
  financialMonthForDate,
  financialMonthRangeByMonth,
  offsetFinancialMonth,
  todayStr,
  type FinancialMonthConfig,
} from "@/lib/date-range";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { cn } from "@/lib/utils";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader, ClearTile } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { AnchoredTip } from "@/components/anchored-tip";
import { CategoryTrendList } from "@/app/trends/category-trend-list";
import { MonthComparison } from "@/app/trends/month-comparison";
import { ChangeChip, KpiCard, change } from "./overview-cards";
import { MoneyText } from "@/components/clear/money";

// ── Data ──────────────────────────────────────────────────────────────────────

const BUDGET_GROUPS = ["nodig", "willen"] as const;

/**
 * The budget months (keyed YYYY-MM by the month they start in, as in lib/date-range)
 * that [from,to] covers: every one that ends inside it, so a calendar year is the twelve
 * budget months named January … December. A range shorter than a budget month falls
 * back to the one `to` is in.
 */
function budgetMonthsIn(from: string, to: string, financialMonth: FinancialMonthConfig): string[] {
  const last = financialMonthForDate(to, financialMonth);
  const months: string[] = [];
  for (let m = financialMonthForDate(from, financialMonth); m <= last; m = offsetFinancialMonth(m, 1)) {
    const end = financialMonthRangeByMonth(m, financialMonth).to;
    if (end >= from && end <= to) months.push(m);
  }
  return months.length > 0 ? months : [last];
}

async function getTrendsData(
  from: string,
  to: string,
  cmpA: string,
  cmpB: string,
  financialMonth: FinancialMonthConfig,
  categoryIds?: number[],
  accounts?: string[],
) {
  const allCats = await db.select().from(categories).orderBy(categories.group, categories.name);
  // Sub-category totals roll up into their parent.
  const catById = new Map(allCats.map((c) => [c.id, c]));
  const rollupId = (id: number) => catById.get(id)?.parentCategoryId ?? id;
  const months = budgetMonthsIn(from, to, financialMonth); // the budget months the picked period covers
  // The same number of months before it, for the comparison picker and "vs last month".
  const prevMonths = Array.from({ length: months.length }, (_, i) => offsetFinancialMonth(months[0], i - months.length));
  const months24 = [...prevMonths, ...months];
  const current = currentFinancialMonth(financialMonth);
  // Months that haven't started yet (the rest of a calendar year) have nothing to show
  // and would only drag the averages down, so the tab charts up to the current month.
  const startedMonths = months.filter((m) => m <= current);
  const shown = startedMonths.length > 0 ? startedMonths : months;
  const inProgress = shown[shown.length - 1] === current;
  const shownSet = new Set(shown);
  const startDate = financialMonthRangeByMonth(months24[0], financialMonth).from;

  // Which budget month a transaction date belongs to (many rows share a date).
  const monthByDate = new Map<string, string>();
  const monthOf = (date: string) => {
    let m = monthByDate.get(date);
    if (m === undefined) {
      m = financialMonthForDate(date, financialMonth);
      monthByDate.set(date, m);
    }
    return m;
  };

  let monthlyRows = await db.select({
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
    account: transactions.account,
    isReimbursement: transactions.isReimbursement,
    isInternalTransfer: isInternalTransferExpr,
  })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, startDate)))
    .orderBy(asc(transactions.date), asc(transactions.id));

  // Category/account filter — see analytics-tab.tsx's loadAllocations for the same convention.
  if (categoryIds && categoryIds.length > 0) monthlyRows = monthlyRows.filter((r) => r.categoryId != null && categoryIds.includes(r.categoryId));
  if (accounts && accounts.length > 0) monthlyRows = monthlyRows.filter((r) => r.account != null && accounts.includes(r.account));

  const splitRows = await getTransactionSplitRows(monthlyRows.map((row) => row.id));
  const splitMap = groupTransactionSplits(splitRows);
  const netReimbursements = (await getSharedCostMode()) === "net";
  const allocations = buildSplitAllocations(monthlyRows, splitMap, { netReimbursements });

  // Money in and out per month, with Home's rules: reimbursements and internal transfers
  // left out, money moved into savings categories counted as saved rather than spent.
  const monthlyMap: Record<string, { income: number; expense: number; saved: number }> = {};
  for (const m of months24) monthlyMap[m] = { income: 0, expense: 0, saved: 0 };
  for (const row of allocations) {
    if (row.isReimbursement || row.isInternalTransfer) continue;
    const month = monthOf(row.date);
    if (!monthlyMap[month]) continue;
    if (row.categoryGroup === "savings") {
      if (row.direction === "expense") monthlyMap[month].saved += row.amount;
      continue;
    }
    if (row.direction === "income") monthlyMap[month].income += row.amount;
    else monthlyMap[month].expense += row.amount;
  }
  const chartData = shown.map((m) => ({ month: m, ...monthlyMap[m] }));
  const totalIncome = chartData.reduce((s, d) => s + d.income, 0);
  const totalExpense = chartData.reduce((s, d) => s + d.expense, 0);
  const avgIncome = totalIncome / shown.length;
  const avgExpense = totalExpense / shown.length;
  const previousMonth = offsetFinancialMonth(shown[0], -1);
  const previous = { month: previousMonth, ...(monthlyMap[previousMonth] ?? { income: 0, expense: 0, saved: 0 }) };

  const catMonthly = new Map<number, Record<string, number>>();
  const catTotal = new Map<number, number>();
  // Un-rolled-up detail (children counted on their own), plus per-category transaction
  // count / distinct active months — used only by the "Expenses per category" list,
  // which shows subcategories individually instead of merged into their parent.
  const catDetail = new Map<number, { monthly: Record<string, number>; total: number; txCount: number; monthsActive: Set<string> }>();
  for (const row of allocations) {
    if (row.direction !== "expense" || row.isInternalTransfer || row.categoryId == null) continue;
    const month = monthOf(row.date);
    if (!shownSet.has(month)) continue;
    const cid = rollupId(row.categoryId);
    if (!catMonthly.has(cid)) catMonthly.set(cid, {});
    catMonthly.get(cid)![month] = (catMonthly.get(cid)![month] ?? 0) + row.amount;
    catTotal.set(cid, (catTotal.get(cid) ?? 0) + row.amount);

    const rawId = row.categoryId;
    const detail = catDetail.get(rawId) ?? { monthly: {}, total: 0, txCount: 0, monthsActive: new Set<string>() };
    detail.monthly[month] = (detail.monthly[month] ?? 0) + row.amount;
    detail.total += row.amount;
    detail.txCount += 1;
    detail.monthsActive.add(month);
    catDetail.set(rawId, detail);
  }

  const grouped = BUDGET_GROUPS.map((group) => {
    // Only top-level categories with spend are listed; their totals already include children.
    const cats = allCats
      .filter((c) => c.parentCategoryId === null && normalizeBudgetType(c.budgetType) === group && (catTotal.get(c.id) ?? 0) > 0)
      .sort((a, b) => (catTotal.get(b.id) ?? 0) - (catTotal.get(a.id) ?? 0));
    return {
      group,
      categories: cats.map((c) => ({ id: c.id, name: c.name, monthly: catMonthly.get(c.id) ?? {}, total: catTotal.get(c.id) ?? 0 })),
    };
  });

  // Flat, un-rolled-up rows (parents and children alike) for "Expenses per category" —
  // noise-filtered to categories seen across more than one period with more than one
  // transaction.
  const categoryDetailRows = allCats
    .filter((c) => {
      const d = catDetail.get(c.id);
      return !!d && d.total > 0 && d.txCount > 1 && d.monthsActive.size > 1;
    })
    .map((c) => {
      const d = catDetail.get(c.id)!;
      const group = normalizeBudgetType(c.budgetType) === "nodig" ? "nodig" : "willen";
      return { id: c.id, name: c.name, color: c.color ?? null, icon: c.icon ?? null, group, monthly: d.monthly, total: d.total };
    })
    .sort((a, b) => b.total - a.total);

  const groupedDetailed = BUDGET_GROUPS.map((group) => ({
    group,
    categories: categoryDetailRows.filter((c) => c.group === group),
  })).filter((g) => g.categories.length > 0);

  // The single biggest top-level category over the period, for the Total expenses card.
  const topCategory = grouped.flatMap((g) => g.categories).sort((a, b) => b.total - a.total)[0] ?? null;

  const nowYm = shown[shown.length - 1];
  const resolvedCmpA = months24.includes(cmpA) ? cmpA : nowYm;
  const resolvedCmpB = months24.includes(cmpB) ? cmpB : offsetFinancialMonth(nowYm, -1);

  function getMonthStats(ym: string) {
    let income = 0, expense = 0;
    const catMap = new Map<number, { id: number; name: string; color: string | null; icon: string | null; total: number }>();
    for (const row of allocations) {
      if (row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings") continue;
      if (monthOf(row.date) !== ym) continue;
      if (row.direction === "income") income += row.amount;
      else {
        expense += row.amount;
        if (row.categoryId != null) {
          const rid = rollupId(row.categoryId);
          const pc = catById.get(rid);
          const entry = catMap.get(rid) ?? {
            id: rid,
            name: pc?.name ?? row.categoryName ?? "",
            color: pc?.color ?? row.categoryColor ?? null,
            icon: pc?.icon ?? row.categoryIcon ?? null,
            total: 0,
          };
          entry.total += row.amount;
          catMap.set(rid, entry);
        }
      }
    }
    const topCats = [...catMap.values()].sort((a, b) => b.total - a.total).slice(0, 8);
    return { income, expense, topCats };
  }

  return {
    shown, current, inProgress, chartData, previous, grouped, groupedDetailed, topCategory,
    avgIncome, avgExpense, totalIncome, totalExpense,
    // The comparison can pick any month that has data loaded and has started.
    pickableMonths: months24.filter((m) => m <= current),
    cmpA: resolvedCmpA, cmpB: resolvedCmpB,
    statsA: getMonthStats(resolvedCmpA),
    statsB: getMonthStats(resolvedCmpB),
  };
}

/**
 * The bills of a running budget month still to be paid: known unpaid ones, and ones
 * without a match pattern whose due date hasn't come yet. Bills carry no account, so an
 * account filter leaves them out; a category filter keeps its own categories.
 */
async function billsStillDue(month: string, financialMonth: FinancialMonthConfig, categoryIds?: number[], accounts?: string[]) {
  if (accounts?.length) return [];
  const today = todayStr();
  const statuses = await getBillStatuses(month, financialMonth);
  return statuses
    .filter((s) => s.item.type !== "savings" && s.dueDate != null && (s.paid === false || (s.paid === null && s.dueDate >= today)))
    .filter((s) => !categoryIds?.length || (s.item.categoryId != null && categoryIds.includes(s.item.categoryId)))
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .map((s) => ({ name: s.item.name, amount: s.item.amount ?? 0 }));
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

/** A round scale top and its gridline step, so the y-axis lands on round numbers. */
function scale(max: number) {
  const steps = [250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
  const step = steps.find((s) => max / s <= 4) ?? Math.ceil(max / 4 / 100000) * 100000;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 0.5; v += step) ticks.push(v);
  return { top, ticks };
}

/** Which month labels to print: every one on desktop, fewer on phones and long ranges.
 * Counted back from the last month so the current one always gets its label. */
function labelVisibility(n: number, i: number) {
  const fromEnd = n - 1 - i;
  const step = Math.max(1, Math.ceil(n / 12));
  const phoneStep = n > 6 ? step * 2 : step;
  return { desktop: fromEnd % step === 0, phone: fromEnd % phoneStep === 0 };
}

/** The y-axis labels and dashed gridlines behind a chart's plot area. */
function ChartGrid({ ticks, top, tickLabel }: { ticks: number[]; top: number; tickLabel: (v: number) => string }) {
  return (
    <>
      {ticks.map((v) => (
        <span
          key={v}
          aria-hidden
          className="money absolute left-0 w-8 -translate-y-1/2 text-right text-xs text-clear-muted"
          style={{ top: `${100 - (v / top) * 100}%` }}
        >
          {tickLabel(v)}
        </span>
      ))}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-y-0 left-10 right-0 h-full w-[calc(100%-2.5rem)] overflow-visible">
        {ticks.map((v) => (
          <line
            key={v}
            x1="0"
            x2="100"
            y1={100 - (v / top) * 100}
            y2={100 - (v / top) * 100}
            stroke="var(--clr-line)"
            strokeDasharray={v === 0 ? undefined : "3 4"}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </>
  );
}

function MonthLabels({ months, label, bold }: { months: string[]; label: (ym: string) => string; bold?: number }) {
  return (
    <div aria-hidden className="ml-10 flex">
      {months.map((m, i) => {
        const v = labelVisibility(months.length, i);
        return (
          <span
            key={m}
            className={cn(
              "min-w-0 flex-1 text-center text-xs whitespace-nowrap",
              i === bold ? "font-bold text-clear-ink" : "text-clear-muted",
              !v.phone && "max-sm:invisible",
              !v.desktop && "sm:invisible",
            )}
          >
            {label(m)}
          </span>
        );
      })}
    </div>
  );
}

function Legend({ items }: { items: { key: string; swatch: React.ReactNode; label: string }[] }) {
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] font-semibold text-clear-ink-2">
      {items.map((it) => (
        <span key={it.key} className="inline-flex items-center gap-1.5">
          {it.swatch}
          {it.label}
        </span>
      ))}
    </span>
  );
}

const SWATCH = "size-2.5 shrink-0 rounded-[3px]";
const DASH_SWATCH = <span aria-hidden className="w-[22px] border-t-[1.5px] border-dashed border-clear-placeholder" />;

// ── Cards ─────────────────────────────────────────────────────────────────────

/** Expense bars per month (the month in progress hatched), the income line over them,
 * the average spend as a dashed line, and each month's balance underneath. */
async function IncomeExpensesCard({
  data,
  avgExpense,
  inProgress,
  monthShort,
  className,
}: {
  data: { month: string; income: number; expense: number }[];
  avgExpense: number;
  inProgress: boolean;
  monthShort: (ym: string) => string;
  className?: string;
}) {
  const t = await getTranslations("insights.trends");
  const locale = await getLocale();
  const k = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const empty = data.every((d) => d.income === 0 && d.expense === 0);
  const { top, ticks } = scale(Math.max(1, ...data.flatMap((d) => [d.income, d.expense])));
  const n = data.length;
  const last = n - 1;
  const py = (v: number) => 100 - (v / top) * 100;
  const px = (i: number) => ((i + 0.5) / n) * 100;
  const points = data.map((d, i) => `${px(i)},${py(d.income)}`).join(" ");
  const description = t("chartDescription", {
    months: data.map((d) => `${monthShort(d.month)}: ${formatEurWhole(d.income)} / ${formatEurWhole(d.expense)}`).join("; "),
  });

  return (
    <ClearCard aria-labelledby="trends-flow-title" className={className}>
      <ClearCardHeader
        title={<span id="trends-flow-title">{t("incomeVsExpenses")}</span>}
        subtitle={t("incomeVsExpensesSubtitle")}
        action={
          <Legend
            items={[
              {
                key: "in",
                label: t("income"),
                swatch: (
                  <span aria-hidden className="relative inline-flex h-2.5 w-[22px] items-center">
                    <span className="h-[2.5px] w-full rounded-full bg-clear-ink" />
                    <span className="absolute left-1/2 size-2 -translate-x-1/2 rounded-full border-[1.5px] border-clear-card bg-clear-ink" />
                  </span>
                ),
              },
              { key: "out", label: t("expenses"), swatch: <span aria-hidden className={cn(SWATCH, "bg-clear-ember")} /> },
              ...(inProgress ? [{ key: "now", label: t("inProgress"), swatch: <span aria-hidden className={cn(SWATCH, "clear-hatch")} /> }] : []),
              { key: "avg", label: t("avgExpenses"), swatch: DASH_SWATCH },
            ]}
          />
        }
      />
      {empty ? (
        <p className="m-0 py-10 text-center text-sm text-clear-muted">{t("noTransactions")}</p>
      ) : (
        <div role="img" aria-label={description} className="flex flex-col gap-2">
          <div className="relative h-[200px] lg:h-[250px]">
            <ChartGrid ticks={ticks} top={top} tickLabel={(v) => (v === 0 ? "0" : `${k.format(v / 1000)}k`)} />
            <div className="absolute inset-y-0 left-10 right-0">
              <div aria-hidden className="absolute inset-0 flex">
                {data.map((d, i) => (
                  <div key={d.month} className="relative flex min-w-0 flex-1 items-end justify-center">
                    {inProgress && i === last && d.expense > 0 && (
                      <span
                        className="absolute left-1/2 -translate-x-1/2 -translate-y-full pb-1 text-xs font-bold whitespace-nowrap text-clear-ember-text max-sm:hidden"
                        style={{ top: `${py(d.expense)}%` }}
                      >
                        <MoneyText>{formatEurWhole(d.expense)}</MoneyText>
                      </span>
                    )}
                    <div
                      className={cn("w-[46%] max-w-[34px] rounded-[6px]", inProgress && i === last ? "clear-hatch" : "bg-clear-ember")}
                      style={{ height: `${(d.expense / top) * 100}%` }}
                    />
                  </div>
                ))}
              </div>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full overflow-visible">
                {avgExpense > 0 && (
                  <line x1="0" x2="100" y1={py(avgExpense)} y2={py(avgExpense)} stroke="var(--clr-placeholder)" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
                )}
                {n > 1 && (
                  <polyline points={points} fill="none" stroke="var(--clr-ink)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                )}
              </svg>
              {data.map((d, i) => (
                <span
                  key={d.month}
                  aria-hidden
                  className={cn(
                    "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-clear-card bg-clear-ink",
                    i === last ? "size-3.5" : "size-3",
                  )}
                  style={{ left: `${px(i)}%`, top: `${py(d.income)}%` }}
                />
              ))}
            </div>
          </div>
          <MonthLabels months={data.map((d) => d.month)} label={monthShort} bold={last} />
          {/* What was left over per month — only where each month has the room for it. */}
          {n <= 12 && (
            <div aria-hidden className="ml-10 hidden md:flex">
              {data.map((d, i) => {
                const balance = d.income - d.expense;
                return (
                  <span
                    key={d.month}
                    className={cn(
                      "min-w-0 flex-1 text-center text-xs font-bold whitespace-nowrap",
                      inProgress && i === last ? "text-clear-muted" : balance >= 0 ? "text-clear-positive" : "text-clear-negative",
                    )}
                  >
                    <MoneyText>{inProgress && i === last ? t("soFar") : `${balance >= 0 ? "+" : "−"}${formatEurWhole(Math.abs(balance))}`}</MoneyText>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </ClearCard>
  );
}

/** Needs (ink) and wants (ember) stacked per month, against the plan's needs share of
 * income, with the latest month's needs, wants and savings as shares of its income. */
async function NeedsWantsCard({
  months,
  needs,
  wants,
  saved,
  income,
  avgIncome,
  strategy,
  monthShort,
  monthLong,
  className,
}: {
  months: string[];
  needs: number[];
  wants: number[];
  saved: number;
  income: number;
  avgIncome: number;
  strategy: { nodig: number; willen: number; sparen: number };
  monthShort: (ym: string) => string;
  monthLong: (ym: string) => string;
  className?: string;
}) {
  const t = await getTranslations("insights.trends");
  const locale = await getLocale();
  const k = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const n = months.length;
  const last = n - 1;
  const target = (avgIncome * strategy.nodig) / 100;
  const { top, ticks } = scale(Math.max(1, target, ...months.map((_, i) => needs[i] + wants[i])));
  const share = (v: number) => (income > 0 ? Math.round((v / income) * 100) : null);
  const needsShare = share(needs[last] ?? 0);
  const wantsShare = share(wants[last] ?? 0);
  const savedShare = share(saved);
  const empty = months.every((_, i) => needs[i] === 0 && wants[i] === 0);
  const description = t("needsWantsDescription", {
    months: months.map((m, i) => `${monthShort(m)}: ${formatEurWhole(needs[i])} / ${formatEurWhole(wants[i])}`).join("; "),
  });

  const tiles = [
    { key: "needs", label: t("needsIn", { month: monthLong(months[last]) }), value: needs[last] ?? 0, pct: needsShare, good: needsShare != null && needsShare <= strategy.nodig },
    { key: "wants", label: t("wants"), value: wants[last] ?? 0, pct: wantsShare, good: wantsShare != null && wantsShare <= strategy.willen },
    { key: "saved", label: t("savings"), value: saved, pct: savedShare, good: savedShare != null && savedShare >= strategy.sparen },
  ];

  return (
    <ClearCard aria-labelledby="trends-needs-title" data-tip-anchor="insightsNeedsWants" className={className}>
      <ClearCardHeader
        title={<span id="trends-needs-title">{t("needsWants")}</span>}
        subtitle={t("needsWantsSubtitle", { needs: strategy.nodig, wants: strategy.willen, savings: strategy.sparen })}
        action={
          <Legend
            items={[
              { key: "needs", label: t("needs"), swatch: <span aria-hidden className={cn(SWATCH, "bg-clear-ink")} /> },
              { key: "wants", label: t("wants"), swatch: <span aria-hidden className={cn(SWATCH, "bg-clear-ember")} /> },
              ...(target > 0 ? [{ key: "target", label: t("needsTarget", { pct: strategy.nodig }), swatch: DASH_SWATCH }] : []),
            ]}
          />
        }
      />
      {empty ? (
        <p className="m-0 flex flex-1 items-center justify-center py-10 text-center text-sm text-clear-muted">{t("noTransactions")}</p>
      ) : (
        <div role="img" aria-label={description} className="flex min-h-[200px] flex-1 flex-col gap-2">
          <div className="relative min-h-[180px] flex-1">
            <ChartGrid ticks={ticks} top={top} tickLabel={(v) => (v === 0 ? "0" : `${k.format(v / 1000)}k`)} />
            <div className="absolute inset-y-0 left-10 right-0">
              <div aria-hidden className="absolute inset-0 flex">
                {months.map((m, i) => (
                  <div key={m} className="flex min-w-0 flex-1 flex-col-reverse items-center gap-0.5">
                    {needs[i] > 0 && <div className="w-[52%] max-w-[22px] rounded-[4px] bg-clear-ink" style={{ height: `${(needs[i] / top) * 100}%` }} />}
                    {wants[i] > 0 && <div className="w-[52%] max-w-[22px] rounded-[4px] bg-clear-ember" style={{ height: `${(wants[i] / top) * 100}%` }} />}
                  </div>
                ))}
              </div>
              {target > 0 && (
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full overflow-visible">
                  <line x1="0" x2="100" y1={100 - (target / top) * 100} y2={100 - (target / top) * 100} stroke="var(--clr-placeholder)" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
                </svg>
              )}
            </div>
          </div>
          <MonthLabels months={months} label={monthShort} bold={last} />
        </div>
      )}
      <div className="grid grid-cols-3 gap-2.5">
        {tiles.map((tile) => (
          <ClearTile key={tile.key} className="flex min-w-0 flex-col gap-0.5 px-3.5 py-3">
            <span className="truncate text-[13px] text-clear-ink-2">{tile.label}</span>
            <span className="flex flex-wrap items-baseline gap-x-1.5">
              <Amount value={tile.value} whole className="text-lg" />
              {tile.pct != null && (
                <span className={cn("text-[13px] font-bold tabular-nums", tile.good ? "text-clear-positive" : "text-clear-warning")}>{tile.pct}%</span>
              )}
            </span>
          </ClearTile>
        ))}
      </div>
    </ClearCard>
  );
}

// ── Trends tab ────────────────────────────────────────────────────────────────

const MAX_BILL_NAMES = 4;

/**
 * Insights · Trends, per budget month. One month picked: its actual income, expenses and
 * balance on top; several: the averages per month. Then income against expenses, needs
 * and wants, two months side by side and the expenses per category.
 */
export async function TrendsTab({
  from,
  to,
  cmpA,
  cmpB,
  categoryIds,
  accounts,
  financialMonth,
}: {
  from: string;
  to: string;
  cmpA: string;
  cmpB: string;
  categoryIds?: number[];
  accounts?: string[];
  financialMonth: FinancialMonthConfig;
}) {
  const [data, strategy, t, locale] = await Promise.all([
    getTrendsData(from, to, cmpA, cmpB, financialMonth, categoryIds, accounts),
    getBudgetStrategy(),
    getTranslations("insights.trends"),
    getLocale(),
  ]);
  const thisYear = new Date().getFullYear();
  const rangeOf = (ym: string) => financialMonthRangeByMonth(ym, financialMonth);
  // A budget month is named after the month it ends in, like the Budget page: 25 Sep –
  // 24 Oct is October.
  const endOf = (ym: string) => new Date(`${rangeOf(ym).to}T12:00:00`);
  const monthShort = (ym: string) => new Intl.DateTimeFormat(locale, { month: "short" }).format(endOf(ym));
  const monthName = (ym: string) =>
    new Intl.DateTimeFormat(locale, endOf(ym).getFullYear() === thisYear ? { month: "long" } : { month: "long", year: "numeric" }).format(endOf(ym));
  const monthWithYear = (ym: string) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(endOf(ym));
  const dayMonth = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const perMonth = (cls?: string) => <span className={cn("text-[0.5em]", cls)}>{t("perMonth")}</span>;

  const { shown, chartData, inProgress } = data;
  const last = shown[shown.length - 1];
  const single = shown.length === 1;
  const empty = data.totalIncome === 0 && data.totalExpense === 0;

  // The highest month for income and for spending.
  const peak = (key: "income" | "expense") => chartData.reduce((best, d) => (d[key] > best[key] ? d : best), chartData[0]);
  const incomePeak = peak("income");
  const expensePeak = peak("expense");
  const balance = data.avgIncome - data.avgExpense;
  // Months that ended positive — only finished months count, the one in progress hasn't ended.
  const finished = inProgress ? chartData.slice(0, -1) : chartData;
  const positiveCount = finished.filter((d) => d.income - d.expense > 0).length;
  const topShare = data.topCategory && data.totalExpense > 0 ? Math.min(100, Math.round((data.topCategory.total / data.totalExpense) * 100)) : null;
  const keptShare = data.avgIncome > 0 ? Math.round((balance / data.avgIncome) * 100) : null;

  // Needs and wants per month, from the same rolled-up category totals as the list.
  const groupTotal = (group: string, m: string) =>
    data.grouped.filter((g) => g.group === group).flatMap((g) => g.categories).reduce((s, c) => s + (c.monthly[m] ?? 0), 0);

  // One month on its own: against the month before, or — while it runs — until when.
  const singleFoot = (current: number, previous: number, goodWhenUp: boolean, onEmber = false) => {
    if (empty) return t("noTransactions");
    if (inProgress) return t("runsUntil", { date: dayMonth.format(endOf(last)) });
    const delta = change(current, previous);
    return delta ? (
      <>
        <ChangeChip change={delta} goodWhenUp={goodWhenUp} onEmber={onEmber} />
        {t("vsMonth", { month: monthName(data.previous.month) })}
      </>
    ) : null;
  };

  // Under the comparison, while one of its months still runs: until when, and which bills
  // are still to come in it.
  const running = data.cmpA === data.current || data.cmpB === data.current ? data.current : null;
  let footnote: string | null = null;
  if (running) {
    const due = await billsStillDue(running, financialMonth, categoryIds, accounts);
    // It opens the sentence, so capitalised ("oktober" in Dutch).
    const name = monthName(running);
    const month = name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
    const date = dayMonth.format(endOf(running));
    if (due.length === 0) {
      footnote = t("comparisonRunsUntil", { month, date });
    } else {
      const names = due.slice(0, MAX_BILL_NAMES).map((b) => b.name);
      const list =
        due.length > MAX_BILL_NAMES
          ? t("billsMore", { list: names.join(", "), count: due.length - MAX_BILL_NAMES })
          : new Intl.ListFormat(locale, { type: "conjunction" }).format(names);
      const total = due.reduce((s, b) => s + b.amount, 0);
      footnote = t("comparisonStillDue", { month, date, list, amount: formatEurWhole(total) });
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      {/* The key figures: two across on phones, four across on wide screens. */}
      <div className="grid grid-cols-2 gap-2.5 lg:col-span-2 lg:gap-5 xl:col-span-3 xl:grid-cols-4">
        <KpiCard
          highlight
          label={single ? t("income") : t("avgIncome")}
          icon={<IconCoins />}
          value={
            single ? (
              <Amount value={data.avgIncome} className="tabular-nums" centsClassName="opacity-55" />
            ) : (
              <span className="clear-amount whitespace-nowrap">
                <Amount value={data.avgIncome} whole />
                {perMonth("opacity-60")}
              </span>
            )
          }
          foot={
            <MoneyText>{single
              ? singleFoot(data.avgIncome, data.previous.income, true, true)
              : empty
                ? t("noTransactions")
                : incomePeak.income > 0
                  ? t("highestIn", { month: monthName(incomePeak.month), amount: formatEurWhole(incomePeak.income) })
                  : null}</MoneyText>
          }
        />
        <KpiCard
          label={single ? t("expenses") : t("avgExpenses")}
          icon={<IconShoppingBag />}
          value={
            single ? (
              <Amount value={data.avgExpense} className="tabular-nums" />
            ) : (
              <span className="clear-amount whitespace-nowrap">
                <Amount value={data.avgExpense} whole />
                {perMonth("text-clear-placeholder")}
              </span>
            )
          }
          foot={
            <MoneyText>{single
              ? singleFoot(data.avgExpense, data.previous.expense, false)
              : empty
                ? t("noTransactions")
                : expensePeak.expense > 0
                  ? t("highestIn", { month: monthName(expensePeak.month), amount: formatEurWhole(expensePeak.expense) })
                  : null}</MoneyText>
          }
        />
        <KpiCard
          label={single ? t("balance") : t("avgBalance")}
          icon={balance >= 0 ? <IconTrendingUp /> : <IconTrendingDown />}
          iconClassName={empty ? undefined : balance >= 0 ? "bg-clear-mint text-clear-mint-ink" : "bg-clear-peach text-clear-negative"}
          value={
            <span className="clear-amount whitespace-nowrap">
              <Amount
                value={balance}
                sign="always"
                whole={!single}
                className={cn("tabular-nums", !empty && (balance >= 0 ? "text-clear-positive" : "text-clear-negative"))}
              />
              {!single && perMonth("text-clear-placeholder")}
            </span>
          }
          foot={
            empty ? (
              t("noTransactions")
            ) : single ? (
              keptShare != null ? (
                <>
                  <ClearChip tone={keptShare >= 0 ? "mint" : "peach"} className="h-6 px-2 text-xs tabular-nums">{keptShare}%</ClearChip>
                  {t("ofIncomeLeft")}
                </>
              ) : null
            ) : finished.length > 0 ? (
              <>
                <ClearChip tone={positiveCount * 2 >= finished.length ? "mint" : "peach"} className="h-6 px-2 text-xs">
                  {t("positiveCount", { count: positiveCount, total: finished.length })}
                </ClearChip>
                {t("positiveLabel", { total: finished.length })}
              </>
            ) : null
          }
        />
        <KpiCard
          label={t("totalExpenses")}
          icon={<IconChartBar />}
          value={<Amount value={data.totalExpense} whole={!single} className="tabular-nums" />}
          foot={
            empty ? (
              t("noTransactions")
            ) : data.topCategory && topShare != null ? (
              <>
                <ClearChip tone="stone" className="h-6 px-2 text-xs">{topShare}%</ClearChip>
                <span className="min-w-0 truncate">{t("topShare", { category: data.topCategory.name })}</span>
              </>
            ) : null
          }
        />
      </div>

      <IncomeExpensesCard
        data={chartData}
        avgExpense={data.avgExpense}
        inProgress={inProgress}
        monthShort={monthShort}
        className="lg:col-span-2 xl:col-span-3"
      />

      <NeedsWantsCard
        months={shown}
        needs={shown.map((m) => groupTotal("nodig", m))}
        wants={shown.map((m) => groupTotal("willen", m))}
        saved={chartData[chartData.length - 1]?.saved ?? 0}
        income={chartData[chartData.length - 1]?.income ?? 0}
        avgIncome={data.avgIncome}
        strategy={strategy}
        monthShort={monthShort}
        monthLong={monthName}
        className="lg:col-span-2"
      />

      <MonthComparison
        cmpA={data.cmpA}
        cmpB={data.cmpB}
        labelA={monthName(data.cmpA)}
        labelB={monthName(data.cmpB)}
        shortA={monthShort(data.cmpA)}
        shortB={monthShort(data.cmpB)}
        soFar={data.cmpA === data.current}
        statsA={data.statsA}
        statsB={data.statsB}
        months={data.pickableMonths.map((m) => ({ value: m, label: monthWithYear(m) }))}
        footnote={footnote}
        className="lg:col-span-2 xl:col-span-1"
      />

      <CategoryTrendList
        groups={data.groupedDetailed}
        months={shown}
        inProgress={inProgress}
        totalExpense={data.totalExpense}
        currentLabel={monthShort(last)}
        financialMonth={financialMonth}
        periodRange={{ from: rangeOf(shown[0]).from, to: rangeOf(last).to }}
        className="lg:col-span-2 xl:col-span-3"
      />

      <AnchoredTip id="insightsNeedsWants" anchor="insightsNeedsWants" />
    </div>
  );
}

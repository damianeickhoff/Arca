import { db } from "@/db";
import { transactions, categories, banks, savingsGoals, vermogenAccounts, goals } from "@/db/schema";
import { eq, and, gte, asc, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { formatEur, formatEurWhole, BUDGET_TYPE_LABELS, normalizeBudgetType, pctChangeLabel } from "@/lib/format";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { reimbursedAmountExpr } from "@/lib/reimbursed-amount";
import { getSharedCostMode } from "@/lib/app-settings";
import { monthsInRange, precedingMonths, type FinancialMonthConfig } from "@/lib/date-range";
import { getDebtSummary } from "@/lib/debt-calculations";
import { getBankBalances } from "@/lib/account-balances";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { getNetWorthHistory } from "@/lib/net-worth-snapshots";
import { getNetWorthForecast } from "@/lib/net-worth-forecast";
import {
  IconTrendingDown as TrendingDown,
  IconTrendingUp as TrendingUp,
  IconWallet as Wallet,
  IconPigFilled as PiggyBank,
  IconDiamondFilled as Gem,
  IconArrowRight as ArrowRight,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { SPLIT_GRID } from "@/components/page-container";
import { SectionHead } from "@/components/ui/page-heading";
import { Stat } from "@/components/ui/stat";
import { Bar } from "@/components/ui/ring";
import { AxisLabels, Donut, LayeredArea, StackedBars, spreadLabels } from "@/components/ui/charts";
import { MonthlyLineChart } from "@/components/dashboard-charts";
import { ComparisonPicker } from "@/app/trends/comparison-picker";
import { CategoryTrendList } from "@/app/trends/category-trend-list";
import { ChangeRow } from "@/components/change-pill";
import { AnchoredTip } from "@/components/anchored-tip";
import { PeriodSelector } from "./period-selector";
import { AnalyticsFilterBar } from "./analytics-filter-bar";
import { CARD, Kpi } from "./insights-ui";

// ── Trends helpers ────────────────────────────────────────────────────────────

const BUDGET_GROUPS = ["nodig", "willen"] as const;

function prevMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function getTrendsData(
  from: string,
  to: string,
  cmpA: string,
  cmpB: string,
  categoryIds?: number[],
  accounts?: string[],
) {
  const allCats = await db.select().from(categories).orderBy(categories.group, categories.name);
  const allBanksFull = await db.select().from(banks);
  // Sub-category totals roll up into their parent (see trends/page.tsx for the same logic).
  const catById = new Map(allCats.map((c) => [c.id, c]));
  const rollupId = (id: number) => catById.get(id)?.parentCategoryId ?? id;
  const months = monthsInRange(from, to); // the months this tab charts
  const prevMonths = precedingMonths(months); // comparison-only window right before it
  const months24 = [...prevMonths, ...months];
  const currentSet = new Set(months);
  const startDate = `${months24[0]}-01`;
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

  const monthlyMap: Record<string, { income: number; expense: number }> = {};
  for (const m of months24) monthlyMap[m] = { income: 0, expense: 0 };
  for (const row of allocations) {
    if (row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings") continue;
    const month = row.date.slice(0, 7);
    if (!monthlyMap[month]) continue;
    if (row.direction === "income") monthlyMap[month].income += row.amount;
    else monthlyMap[month].expense += row.amount;
  }
  const incomeArr = months.map((m) => monthlyMap[m].income);
  const expenseArr = months.map((m) => monthlyMap[m].expense);
  const avgIncome = incomeArr.reduce((s, v) => s + v, 0) / months.length;
  const avgExpense = expenseArr.reduce((s, v) => s + v, 0) / months.length;
  const avgBalance = avgIncome - avgExpense;
  const chartData = months.map((m, i) => ({ month: m, income: incomeArr[i], expense: expenseArr[i] }));
  const totalIncome = incomeArr.reduce((s, v) => s + v, 0);
  const totalExpense = expenseArr.reduce((s, v) => s + v, 0);
  const prevTotalIncome = prevMonths.reduce((s, m) => s + monthlyMap[m].income, 0);
  const prevTotalExpense = prevMonths.reduce((s, m) => s + monthlyMap[m].expense, 0);

  // Whether transaction history reaches back far enough to cover the whole comparison
  // window — otherwise a "vs prior period" total is an undercount, not a real zero.
  const [earliestRow] = await db.select({ minDate: sql<string | null>`MIN(${transactions.date})` }).from(transactions);
  const prevPeriodDataComplete = !!earliestRow?.minDate && earliestRow.minDate <= `${prevMonths[0]}-01`;

  const catMonthly = new Map<number, Record<string, number>>();
  const catTotal = new Map<number, number>();
  // Un-rolled-up detail (children counted on their own), plus per-category transaction
  // count / distinct active months — used only by the "Expenses per category" list,
  // which shows subcategories individually instead of merged into their parent.
  const catDetail = new Map<number, { monthly: Record<string, number>; total: number; txCount: number; monthsActive: Set<string> }>();
  for (const row of allocations) {
    if (row.direction !== "expense" || row.isInternalTransfer || row.categoryId == null) continue;
    const month = row.date.slice(0, 7);
    if (!currentSet.has(month)) continue;
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
      label: BUDGET_TYPE_LABELS[group] ?? group,
      categories: cats.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color ?? null,
        icon: c.icon ?? null,
        monthly: catMonthly.get(c.id) ?? {},
        total: catTotal.get(c.id) ?? 0,
      })),
    };
  }).filter((g) => g.categories.length > 0);

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
    label: BUDGET_TYPE_LABELS[group] ?? group,
    categories: categoryDetailRows.filter((c) => c.group === group),
  })).filter((g) => g.categories.length > 0);

  const nowYm = months[months.length - 1];
  const resolvedCmpA = months24.includes(cmpA) ? cmpA : nowYm;
  const resolvedCmpB = months24.includes(cmpB) ? cmpB : prevMonth(nowYm);

  function getMonthStats(ym: string) {
    let income = 0, expense = 0;
    const catMap = new Map<number, { id: number; name: string; color: string | null; total: number }>();
    for (const row of allocations) {
      if (row.isReimbursement || row.isInternalTransfer || row.categoryGroup === "savings") continue;
      if (row.date.slice(0, 7) !== ym) continue;
      if (row.direction === "income") income += row.amount;
      else {
        expense += row.amount;
        if (row.categoryId != null) {
          const rid = rollupId(row.categoryId);
          const pc = catById.get(rid);
          const entry = catMap.get(rid) ?? { id: rid, name: pc?.name ?? row.categoryName ?? "Unknown", color: pc?.color ?? row.categoryColor ?? null, total: 0 };
          entry.total += row.amount;
          catMap.set(rid, entry);
        }
      }
    }
    const topCats = [...catMap.values()].sort((a, b) => b.total - a.total).slice(0, 6);
    return { income, expense, balance: income - expense, topCats };
  }

  const prevAvgBalance = (prevTotalIncome - prevTotalExpense) / prevMonths.length;

  return {
    months, chartData, grouped, groupedDetailed,
    avgIncome, avgExpense, avgBalance,
    totalIncome, totalExpense,
    incomeChange: prevPeriodDataComplete ? pctChangeLabel(totalIncome, prevTotalIncome) : null,
    expenseChange: prevPeriodDataComplete ? pctChangeLabel(totalExpense, prevTotalExpense) : null,
    balanceChange: prevPeriodDataComplete ? pctChangeLabel(avgBalance, prevAvgBalance) : null,
    cmpA: resolvedCmpA, cmpB: resolvedCmpB,
    statsA: getMonthStats(resolvedCmpA),
    statsB: getMonthStats(resolvedCmpB),
    allCats, allBanksFull,
  };
}

// ── Net worth helpers ─────────────────────────────────────────────────────

// The kinds of tracked account, in the V5 categorical colours. Labels live at
// insights.netWorth.types.<value>.
const VERMOGEN_TYPES = [
  { value: "spaarrekening",  color: "#1F8F8A", icon: PiggyBank },
  { value: "beleggingen",    color: "#6B5BD2", icon: TrendingUp },
  { value: "betaalrekening", color: "var(--arca-accent-strong)", icon: Wallet },
  { value: "bezitting",      color: "#6E7A86", icon: Gem },
];

export async function getNetWorthData() {
  const [savingsGoalRows, savingsTypeGoalRows, debtSummary, accounts, bankBalances] = await Promise.all([
    db.select().from(savingsGoals).where(eq(savingsGoals.active, true)),
    db.select().from(goals).where(and(eq(goals.active, true), eq(goals.goalType, "savings"))),
    getDebtSummary(),
    db.select().from(vermogenAccounts).where(eq(vermogenAccounts.active, true)),
    getBankBalances(),
  ]);

  // Combine the two savings-goal sources (old dedicated table + unified goals
  // table's savings type) into one list — both feed net worth the same way.
  const goalList: { id: number; name: string; currentAmount: number; targetAmount: number; color: string | null; monthlyContribution: number | null }[] = [
    ...savingsGoalRows,
    ...savingsTypeGoalRows,
  ];

  // Only banks explicitly opted into net worth — matches computeNetWorth() in
  // net-worth-snapshots.ts and the dedicated /net-worth page.
  const netWorthBanks = bankBalances.filter((b) => b.includeInNetWorth);

  const totalSavings = goalList.reduce((s, g) => s + g.currentAmount, 0);
  const totalAccounts = accounts.reduce((s, a) => s + a.value, 0) + netWorthBanks.reduce((s, b) => s + b.balance, 0);
  // Money owed to the user (direction 'owed') is a receivable asset, added to net worth.
  const totalAssets = totalSavings + totalAccounts + (debtSummary?.totalOwed ?? 0);
  const totalDebt = debtSummary?.totalBalance ?? 0;
  const netWorth = totalAssets - totalDebt;

  return { goals: goalList, debtSummary, totalSavings, totalAccounts, totalAssets, totalDebt, netWorth, accounts, netWorthBanks };
}

// ── Trends tab ────────────────────────────────────────────────────────────────

export async function TrendsTab({
  from,
  to,
  cmpA,
  cmpB,
  categoryIds,
  accounts,
  financialMonth,
  embedded = false,
}: {
  from: string;
  to: string;
  cmpA: string;
  cmpB: string;
  categoryIds?: number[];
  accounts?: string[];
  financialMonth: FinancialMonthConfig;
  /** See AnalyticsTab's `embedded` — same dashboard-Reports-portal-vs-standalone-page
   * distinction, for the same reason (AnalyticsFilterBar's sticky offset). */
  embedded?: boolean;
}) {
  const data = await getTrendsData(from, to, cmpA, cmpB, categoryIds, accounts);
  const chartedPeriod = { from, to };
  const t = await getTranslations("insights.trends");
  const locale = await getLocale();
  const dateLocale = locale === "nl" ? "nl-NL" : "en-GB";
  const monthShort = (ym: string) => new Date(`${ym}-15T12:00:00`).toLocaleDateString(dateLocale, { month: "short" });
  const monthLong = (ym: string) => new Date(`${ym}-15T12:00:00`).toLocaleDateString(dateLocale, { month: "long", year: "numeric" });

  // Needs and wants per month, from the same rolled-up category totals as the list.
  const groupTotal = (group: string, m: string) =>
    data.grouped.filter((g) => g.group === group).flatMap((g) => g.categories).reduce((s, c) => s + (c.monthly[m] ?? 0), 0);
  const needsWants = data.months.map((m) => [groupTotal("nodig", m), groupTotal("willen", m)]);

  return (
    <div className="flex flex-col gap-5">
      <AnalyticsFilterBar
        categories={data.allCats}
        banks={data.allBanksFull}
        stickyTop={embedded ? "0px" : "calc(var(--sat) + 50px)"}
      />

      <p className="mono-label -mb-2 text-[11px]">{t("months", { count: data.months.length })}</p>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3.5">
        <Kpi label={t("avgIncome")} value={formatEur(data.avgIncome)} tone="positive" change={null} />
        <Kpi label={t("avgExpenses")} value={formatEur(data.avgExpense)} change={null} />
        <Kpi label={t("avgBalance")} value={formatEur(data.avgBalance)} tone={data.avgBalance >= 0 ? "accent" : "default"} change={data.balanceChange} />
        <Kpi
          label={t("totalExpenses")}
          value={formatEur(data.totalExpense)}
          change={data.expenseChange ? { ...data.expenseChange, up: !data.expenseChange.up } : null}
          note={data.expenseChange ? undefined : t("noPrevious")}
        />
      </div>

      <div className={SPLIT_GRID}>
        <div className="flex min-w-0 flex-col gap-5">
          {/* Needs and wants per month */}
          <section data-tip-anchor="insightsNeedsWants" className={cn(CARD, "flex flex-col gap-3.5 p-[18px] lg:px-5")}>
            <SectionHead title={t("needsWants")} size="sm" />
            <StackedBars
              columns={needsWants}
              colors={["var(--arca-ink)", "var(--arca-accent)"]}
              height={170}
              gap={data.months.length > 8 ? 8 : 20}
              titles={data.months.map((m, i) => `${monthLong(m)} · ${t("needs")} ${formatEur(needsWants[i][0])} · ${t("wants")} ${formatEur(needsWants[i][1])}`)}
            />
            <AxisLabels labels={spreadLabels(data.months, Math.min(6, data.months.length)).map(monthShort)} />
            <div className="flex gap-3.5">
              <span className="mono-label inline-flex items-center gap-1.5 text-[10px] text-ink"><span className="size-2 rounded-full bg-ink" />{t("needs")}</span>
              <span className="mono-label inline-flex items-center gap-1.5 text-[10px] text-mustard-strong"><span className="size-2 rounded-full bg-mustard" />{t("wants")}</span>
            </div>
          </section>

          {/* Income vs expenses — the existing line chart, in V5 colours. */}
          <section className={cn(CARD, "flex flex-col gap-3 p-[18px] lg:px-5")}>
            <SectionHead
              title={t("incomeVsExpenses")}
              size="sm"
              link={
                <span className="inline-flex items-center gap-3 text-ink-2">
                  <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-positive" />{t("income")}</span>
                  <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-ink" />{t("expenses")}</span>
                </span>
              }
            />
            <div className="flex flex-wrap items-baseline gap-2">
              <span className={cn("amount text-[26px] tabular-nums", data.totalIncome - data.totalExpense < 0 ? "text-negative" : "text-ink")}>
                {formatEur(data.totalIncome - data.totalExpense)}
              </span>
              <ChangeRow change={data.balanceChange} caption={t("months", { count: data.months.length })} className="" />
            </div>
            <MonthlyLineChart data={data.chartData} labels={{ income: t("income"), expenses: t("expenses") }} />
            <div className="grid grid-cols-2 gap-2">
              <Stat label={t("expenses")} value={formatEur(data.totalExpense)} />
              <Stat label={t("income")} value={`+${formatEur(data.totalIncome)}`} tone="positive" />
            </div>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <CategoryTrendList groups={data.groupedDetailed} months={data.months} financialMonth={financialMonth} periodRange={chartedPeriod} />
        </div>
      </div>

      {/* Month comparison */}
      <section className={cn(CARD, "flex flex-col gap-4 p-[18px] lg:px-5")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHead title={t("comparison")} size="sm" />
          <ComparisonPicker cmpA={data.cmpA} cmpB={data.cmpB} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { label: t("income"), a: data.statsA.income, b: data.statsB.income },
            { label: t("expenses"), a: data.statsA.expense, b: data.statsB.expense },
            { label: t("balance"), a: data.statsA.balance, b: data.statsB.balance },
          ].map(({ label, a, b }) => {
            const diff = a - b;
            const diffPct = b !== 0 ? Math.round((diff / Math.abs(b)) * 100) : null;
            return (
              <div key={label} className="flex min-w-0 flex-col gap-1 rounded-tile bg-surface-2 px-3.5 py-3">
                <span className="mono-label text-[10px]">{label}</span>
                <span className="flex items-end justify-between gap-2">
                  <span className="amount text-[17px] tabular-nums text-ink">{formatEur(a)}</span>
                  {diffPct !== null && (
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums", diff > 0 ? "bg-positive-soft text-positive" : diff < 0 ? "bg-negative-soft text-negative" : "bg-surface text-ink-2")}>
                      {diff > 0 ? "+" : ""}
                      {diffPct}%
                    </span>
                  )}
                </span>
                <span className="text-[11px] tabular-nums text-ink-3">{monthLong(data.cmpB)}: {formatEur(b)}</span>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: monthLong(data.cmpA), stats: data.statsA },
            { label: monthLong(data.cmpB), stats: data.statsB },
          ].map(({ label, stats }) => (
            <div key={label} className="flex min-w-0 flex-col gap-2">
              <span className="mono-label text-[10px]">{label}</span>
              {stats.topCats.length > 0 ? (
                stats.topCats.map((cat) => {
                  const maxTotal = Math.max(...stats.topCats.map((c) => c.total), 1);
                  return (
                    <div key={cat.id} className="flex flex-col gap-1">
                      <span className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-ink">{cat.name}</span>
                        <span className="shrink-0 tabular-nums text-ink-3">{formatEur(cat.total)}</span>
                      </span>
                      <Bar pct={(cat.total / maxTotal) * 100} color={cat.color ?? "var(--arca-ink)"} height={5} />
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-ink-3">{t("noData")}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <AnchoredTip id="insightsNeedsWants" anchor="insightsNeedsWants" />

      <PeriodSelector from={from} to={to} financialMonth={financialMonth} budgetPeriod={null} tab="trends" embedded={embedded} />
    </div>
  );
}

// ── Net worth tab ──────────────────────────────────────────────────────────────

export async function VermogenTab() {
  const [{ goals, debtSummary, totalSavings, totalAssets, totalDebt, netWorth, accounts, netWorthBanks }, history] = await Promise.all([
    getNetWorthData(),
    getNetWorthHistory(90),
  ]);
  const t = await getTranslations("insights.netWorth");
  const locale = await getLocale();
  const dateLocale = locale === "nl" ? "nl-NL" : "en-GB";

  const hasHistory = history.length >= 2;
  const firstNetWorth = history[0]?.netWorth ?? netWorth;
  const historyChange = hasHistory ? pctChangeLabel(netWorth, firstNetWorth) : null;
  const historyDelta = hasHistory ? netWorth - firstNetWorth : null;
  const forecast = hasHistory ? await getNetWorthForecast(netWorth, history[history.length - 1].date) : [];
  const projected = forecast.length > 0 ? forecast[forecast.length - 1] : null;
  const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" });

  const groupedAccounts = VERMOGEN_TYPES.map((type) => ({
    ...type,
    items: accounts.filter((a) => a.type === type.value),
  })).filter((g) => g.items.length > 0);

  // What makes up total assets — savings goals, each kind of tracked account, the bank
  // accounts counted in net worth, money owed to you, and any other account. The parts
  // add up to exactly totalAssets (see getNetWorthData), which the donut is scaled to.
  const totalNetWorthBanks = netWorthBanks.reduce((s, b) => s + b.balance, 0);
  const knownTypes = new Set(VERMOGEN_TYPES.map((v) => v.value));
  const otherAccountsTotal = accounts.filter((a) => !knownTypes.has(a.type)).reduce((s, a) => s + a.value, 0);
  const totalOwed = debtSummary?.totalOwed ?? 0;
  const assetSlices = [
    ...(totalSavings > 0 ? [{ key: "goals", name: t("savingsGoals"), sub: goals.map((g) => g.name).join(" · "), value: totalSavings, color: "#1F8F8A", Icon: PiggyBank }] : []),
    ...groupedAccounts.map((g) => ({
      key: g.value,
      name: t(`types.${g.value}`),
      sub: g.items.map((a) => a.name).join(" · "),
      value: g.items.reduce((s, a) => s + a.value, 0),
      color: g.color,
      Icon: g.icon,
    })),
    ...(totalNetWorthBanks > 0
      ? [{ key: "banks", name: t("bankAccounts"), sub: netWorthBanks.map((b) => b.displayName ?? b.accountNumber ?? "").filter(Boolean).join(" · "), value: totalNetWorthBanks, color: "var(--arca-accent-strong)", Icon: Wallet }]
      : []),
    ...(totalOwed > 0 ? [{ key: "owed", name: t("owedToYou"), sub: "", value: totalOwed, color: "#6E7A86", Icon: ArrowRight }] : []),
    ...(otherAccountsTotal > 0 ? [{ key: "other", name: t("other"), sub: "", value: otherAccountsTotal, color: "#A9A294", Icon: Gem }] : []),
  ].filter((s) => s.value > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className={SPLIT_GRID}>
        <div className="flex min-w-0 flex-col gap-5">
          {/* Net worth with assets against debts over the recorded snapshots. */}
          <section className={cn(CARD, "flex flex-col gap-4 p-[18px] lg:px-6 lg:py-[22px]")}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-ink-2">{t("title")}</span>
                <span className={cn("amount text-[40px] leading-none tracking-[-0.035em] lg:text-[54px]", netWorth < 0 ? "text-negative" : "text-ink")}>
                  {formatEurWhole(netWorth)}
                </span>
                <ChangeRow change={historyChange} caption={t("vsDaysAgo", { count: history.length })} className="" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label={t("assets")} value={formatEurWhole(totalAssets)} />
                <Stat label={t("debts")} value={formatEurWhole(-totalDebt)} tone="negative" />
                <Stat
                  label={t("days", { count: history.length })}
                  value={historyDelta == null ? "—" : `${historyDelta >= 0 ? "+" : ""}${formatEurWhole(historyDelta)}`}
                  tone={historyDelta == null ? "default" : historyDelta >= 0 ? "positive" : "negative"}
                />
              </div>
            </div>
            {hasHistory ? (
              <>
                <LayeredArea
                  a={history.map((h) => h.totalAssets)}
                  b={history.map((h) => h.totalDebt)}
                  gradientId="networth-assets"
                  height={180}
                />
                <AxisLabels labels={spreadLabels(history.map((h) => shortDate(h.date)), 5)} />
                <div className="flex gap-3.5">
                  <span className="mono-label inline-flex items-center gap-1.5 text-[10px] text-ink"><span className="size-2 rounded-full bg-ink" />{t("assets")}</span>
                  <span className="mono-label inline-flex items-center gap-1.5 text-[10px] text-negative"><span className="size-2 rounded-full bg-negative" />{t("debts")}</span>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-xs text-ink-3">{t("building")}</p>
            )}
          </section>

          {/* Where it is heading — the existing net worth forecast. */}
          {projected && (
            <section className={cn(CARD, "flex flex-col gap-1.5 px-[18px] py-4 lg:px-[22px]")}>
              <span className="mono-label text-[10px]">{t("projection", { count: forecast.length })}</span>
              <span className="amount text-xl text-ink">
                {t("projectedBy", { amount: formatEurWhole(projected.netWorth), date: new Date(`${projected.date}T12:00:00`).toLocaleDateString(dateLocale, { month: "long", year: "numeric" }) })}
              </span>
              <span className="text-xs leading-[1.5] text-ink-2">{t("projectionNote")}</span>
            </section>
          )}

          {/* Savings goals and debts, each with its progress. */}
          <div className="grid gap-5 md:grid-cols-2">
            <section className={cn(CARD, "flex flex-col gap-3 px-[18px] py-4 lg:px-5")}>
              <SectionHead title={t("savingsGoals")} size="sm" link={t("manage")} href="/goals" />
              {goals.length === 0 ? (
                <p className="text-[13px] text-ink-3">{t("noGoals")}</p>
              ) : (
                goals.map((goal) => {
                  const pct = goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0;
                  return (
                    <div key={`${goal.id}-${goal.name}`} className="flex flex-col gap-1.5">
                      <span className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-semibold text-ink">{goal.name}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-ink">{formatEur(goal.currentAmount)}</span>
                      </span>
                      <Bar pct={pct} color={goal.color ?? "#1F8F8A"} height={6} />
                      <span className="flex justify-between text-[11px] tabular-nums text-ink-3">
                        <span>{t("ofGoal", { pct: pct.toFixed(0) })}</span>
                        <span>{formatEur(goal.targetAmount)}</span>
                      </span>
                    </div>
                  );
                })
              )}
            </section>

            <section className={cn(CARD, "flex flex-col gap-3 px-[18px] py-4 lg:px-5")}>
              <SectionHead title={t("debts")} size="sm" link={t("manage")} href="/debts" />
              {debtSummary && debtSummary.debts.length > 0 ? (
                <>
                  {debtSummary.debts.map(({ debt, currentBalance, amountPaid }) => {
                    const pct = debt.startingBalance > 0 ? Math.min(100, (amountPaid / debt.startingBalance) * 100) : 100;
                    return (
                      <div key={debt.id} className="flex flex-col gap-1.5">
                        <span className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate font-semibold text-ink">{debt.name}</span>
                          <span className="shrink-0 font-semibold tabular-nums text-ink">{formatEur(currentBalance)}</span>
                        </span>
                        <Bar pct={pct} color={debt.color ?? "var(--arca-ink-3)"} height={6} />
                        <span className="flex justify-between text-[11px] tabular-nums text-ink-3">
                          <span>{t("paidPct", { pct: pct.toFixed(0) })}</span>
                          <span>{formatEur(debt.startingBalance)}</span>
                        </span>
                      </div>
                    );
                  })}
                  <div className="mt-1 flex items-center justify-between border-t border-line pt-3 text-sm font-semibold text-ink">
                    <span>{t("total")}</span>
                    <span className="amount tabular-nums">{formatEur(totalDebt)}</span>
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-ink-3">{t("noDebts")}</p>
              )}
            </section>
          </div>
        </div>

        {/* What you own and owe — the assets composition, then the debts. */}
        <section className={cn(CARD, "flex flex-col gap-2 px-[18px] py-4 lg:px-5")}>
          <SectionHead title={t("ownOwe")} size="sm" link={t("accounts")} href="/settings?tab=banks" />
          {assetSlices.length > 0 && (
            <div className="flex justify-center py-2">
              <Donut parts={assetSlices.map((s) => ({ value: s.value, color: s.color }))} size={150}>
                <span className="amount text-lg leading-none text-ink">{formatEurWhole(totalAssets)}</span>
                <span className="mono-label mt-1 text-[9px]">{t("totalAssets")}</span>
              </Donut>
            </div>
          )}
          {assetSlices.map((s) => (
            <div key={s.key} className="flex min-h-[54px] items-center gap-3">
              <span
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: `color-mix(in srgb, ${s.color} var(--arca-icon-wash), transparent)`, color: s.color }}
              >
                <s.Icon className="size-[17px]" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-ink">{s.name}</span>
                {s.sub && <span className="truncate text-xs text-ink-3">{s.sub}</span>}
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-sm font-semibold tabular-nums text-ink">{formatEur(s.value)}</span>
                <span className="text-[11px] tabular-nums text-ink-3">{totalAssets > 0 ? `${((s.value / totalAssets) * 100).toFixed(1)}%` : ""}</span>
              </span>
            </div>
          ))}
          {totalDebt > 0 && (
            <div className="flex min-h-[54px] items-center gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-negative-soft text-negative">
                <TrendingDown className="size-[17px]" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-ink">{t("debts")}</span>
                <span className="truncate text-xs text-ink-3">{debtSummary?.debts.map((d) => d.debt.name).join(" · ")}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-negative">{formatEur(-totalDebt)}</span>
            </div>
          )}
          {assetSlices.length === 0 && totalDebt === 0 && <p className="text-[13px] text-ink-3">{t("noAssets")}</p>}
        </section>
      </div>
    </div>
  );
}

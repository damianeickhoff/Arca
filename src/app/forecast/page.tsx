import { db } from "@/db";
import { recurringItems, prognoseOverrides, savingsGoals, savingsMonthOverrides, budgetTargets, categories, variablePrognoseOverrides, goals as goalsTable, transactions, banks } from "@/db/schema";
import { eq, and, gte, lte, gt } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { formatEur, formatEurWhole, toMonthly, pctChangeLabel } from "@/lib/format";
import type { RecurringItem, PrognoseOverride, SavingsGoal, Category } from "@/db/schema";
import { PrognoseOverrideBtn } from "./forecast-override-btn";
import { SavingsPrognoseOverrideBtn } from "./savings-override-btn";
import {
  IconTrendingUp as TrendingUp,
  IconTrendingDown as TrendingDown,
  IconAlertTriangleFilled as AlertTriangle,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { SPLIT_GRID } from "@/components/page-container";
import { SectionHead } from "@/components/ui/page-heading";
import { Stat } from "@/components/ui/stat";
import { Pill } from "@/components/ui/pill";
import { CategoryIcon } from "@/components/ui/category-icon";
import { CARD } from "@/app/reports/insights-ui";
import { AnchoredTip } from "@/components/anchored-tip";
import { PrognosePeriodPicker } from "./prognose-period-picker";
import { CollapsibleSection } from "./collapsible-section";
import { CategoryCard } from "./category-card";
import { TypeSection } from "./type-section";
import { CategoryGroup } from "./category-group";
import { ExpenseDonutChart } from "./forecast-charts";
import { CashFlowChart } from "./cash-flow-chart";
import { CashFlowCalendar } from "./cash-flow-calendar";
import { CashFlowEvents } from "./cash-flow-events";
import { NetWorthTrendChart } from "@/app/reports/net-worth-trend-chart";
import { ChangePill } from "@/components/change-pill";
import { getFinancialMonthConfig, getBudgetStrategy } from "@/lib/app-settings";
import { resolveRecurringIcon } from "@/lib/auto-brand";
import { currentFinancialMonth } from "@/lib/date-range";
import { computeNetWorth } from "@/lib/net-worth-snapshots";
import { getCashFlowForecast, signedForecastEur, FORECAST_HORIZON_DAYS } from "@/lib/cash-flow-forecast";
import { isInternalTransferExpr, effectiveTransferTypeExpr } from "@/lib/internal-transfers";
import type { TransactionDetail } from "@/app/transactions/transaction-types";
import Link from "next/link";
import { BudgetTabs } from "@/app/budget/budget-tabs";

export const dynamic = "force-dynamic";

const EXPENSE_TYPES = ["bill", "subscription", "debt"] as const;

// The V5 categorical colours for the distribution donut.
const TYPE_COLORS: Record<string, string> = {
  bill:         "var(--arca-info)",
  subscription: "#6B5BD2",
  debt:         "var(--arca-negative)",
  savings:      "#1F8F8A",
  income:       "var(--arca-positive)",
  vrij:         "#A9A294",
  budget:       "var(--arca-accent)",
};

// Forecast health, in the priority the cash flow section surfaces it: negative first,
// then the low-balance warning, then healthy. Colors reuse the app's semantic tokens
// so this matches the Budget distribution bars further down the tab.
// The verdict's icon; its label lives at insights.forecast.status.<status>.
const CASH_FLOW_STATUS = {
  healthy:  { icon: TrendingUp },
  warning:  { icon: AlertTriangle },
  critical: { icon: TrendingDown },
  // Nothing to forecast from yet — neutral, so it doesn't read as a verdict.
  empty:    { icon: TrendingUp },
} as const;

function offsetMonth(base: string, delta: number): string {
  const [y, m] = base.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string, dateLocale: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(dateLocale, { month: "long", year: "numeric" });
}

function buildOverrideLookup(overrides: PrognoseOverride[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const o of overrides) {
    map.set(`${o.recurringItemId}:${o.month}`, o.amount);
  }
  return map;
}

function getEffectiveMonthly(item: RecurringItem, month: string, lookup: Map<string, number>): number {
  const key = `${item.id}:${month}`;
  if (lookup.has(key)) return lookup.get(key)!;
  return toMonthly(item.amount, item.frequency);
}

function buildProjection(
  items: RecurringItem[],
  startMonth: string,
  overrideLookup: Map<string, number>,
  months = 12,
  getSavingsForMonth: (month: string) => number = () => 0,
  variableBudgetMonthly = 0,
) {
  const incomeItems  = items.filter((i) => i.type === "income");
  const expenseItems = items.filter((i) => (EXPENSE_TYPES as readonly string[]).includes(i.type));

  let cumBalance = 0;
  const balanceData = [];

  for (let i = 0; i < months; i++) {
    const m = offsetMonth(startMonth, i);

    const monthIncome   = incomeItems.reduce((s, it) => s + getEffectiveMonthly(it, m, overrideLookup), 0);
    const monthExpenses = expenseItems.reduce((s, it) => s + getEffectiveMonthly(it, m, overrideLookup), 0) + getSavingsForMonth(m) + variableBudgetMonthly;
    const monthFree     = monthIncome - monthExpenses;

    cumBalance += monthFree;

    balanceData.push({ month: m, balance: Math.round(cumBalance) });
  }

  return balanceData;
}

// Groups recurring items by their real linked category (instead of the hardcoded
// type-based taxonomy) — items without a category fall into a per-type "Other"
// bucket so nothing silently disappears.
function groupByCategory<T extends { categoryId: number | null }>(
  items: T[],
  categoriesById: Map<number, Category>,
  otherLabel: string,
) {
  const groups = new Map<string, { key: string; name: string; color: string | null; items: T[] }>();
  for (const item of items) {
    const cat = item.categoryId != null ? categoriesById.get(item.categoryId) : undefined;
    const key = cat ? `cat:${cat.id}` : "other";
    const existing = groups.get(key);
    if (existing) existing.items.push(item);
    else groups.set(key, { key, name: cat?.name ?? otherLabel, color: cat?.color ?? null, items: [item] });
  }
  return [...groups.values()];
}

export default async function PrognPage({
  searchParams,
  embedded = false,
  stickyTop = "var(--sat)",
  dockAboveNav,
}: {
  searchParams: Promise<{ month?: string }>;
  // True when rendered inside another page's overlay (the dashboard's Analytics
  // portal) instead of the standalone /forecast route. Hides the Budget/Forecast
  // tab switcher in that case — usePathname() there reads the host page's path
  // (e.g. /), never matches either tab, so it always fell back to showing
  // "Budget" as active, and tapping it would navigate the whole app away from
  // the overlay to the real /budget route instead of just switching content
  // inside the modal.
  embedded?: boolean;
  // CSS `top` for the mobile top bar's own `position: sticky`. Defaults to the
  // standalone page's own offset; the Reports portal passes an offset that clears
  // its own sticky header instead (see AnalyticsFilterBar's `stickyTop`, same
  // collision it avoids).
  stickyTop?: string;
  /** Passed through to the month picker — see PrognosePeriodPicker.aboveNav. */
  dockAboveNav?: boolean;
}) {
  const sp = await searchParams;
  const [financialMonth, strategy, t, locale] = await Promise.all([getFinancialMonthConfig(), getBudgetStrategy(), getTranslations("insights.forecast"), getLocale()]);
  const dateLocale = locale === "nl" ? "nl-NL" : "en-GB";
  const perMonth = (amount: string) => t("perMonth", { amount });
  const freqLabel = (frequency: string) => (["yearly", "quarterly", "weekly", "once"].includes(frequency) ? t(`freq.${frequency}`) : frequency);

  const baseMonth = sp.month ?? currentFinancialMonth(financialMonth);

  const rangeEnd = offsetMonth(baseMonth, 11);
  const [baseYear, baseMon] = baseMonth.split("-").map(Number);

  const [itemsRaw, overridesRaw, goals, savingsOverridesRaw, allCategories, [monthBudgetTargets, defaultBudgetTargets], variableOverridesRaw, netWorthData] = await Promise.all([
    db.select().from(recurringItems)
      .where(eq(recurringItems.active, true))
      .orderBy(recurringItems.type, recurringItems.name),
    db.select().from(prognoseOverrides).where(
      and(
        gte(prognoseOverrides.month, baseMonth),
        lte(prognoseOverrides.month, rangeEnd),
      ),
    ),
    db.select().from(savingsGoals)
      .where(eq(savingsGoals.active, true))
      .orderBy(savingsGoals.name),
    db.select().from(savingsMonthOverrides).where(
      and(
        gte(savingsMonthOverrides.month, baseMonth),
        lte(savingsMonthOverrides.month, rangeEnd),
      ),
    ),
    db.select().from(categories),
    Promise.all([
      db.select().from(budgetTargets).where(and(eq(budgetTargets.year, baseYear), eq(budgetTargets.month, baseMon))),
      db.select().from(budgetTargets).where(and(eq(budgetTargets.year, 0), eq(budgetTargets.month, 0))),
    ]),
    db.select().from(variablePrognoseOverrides).where(
      eq(variablePrognoseOverrides.month, baseMonth),
    ),
    computeNetWorth(),
  ]);

  // ── Cash flow forecast ──────────────────────────────────────────────────────
  // Day-level projection (balance + upcoming recurring + booked future transactions),
  // as opposed to the month-level Prognose above it. Deliberately not driven by the
  // month picker: it always looks forward from today.
  const cashFlow = await getCashFlowForecast(financialMonth);
  const [cashFlowTxRows, cashFlowSavingsGoals] = await Promise.all([
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        direction: transactions.direction,
        amount: transactions.amount,
        correctedAmount: transactions.correctedAmount,
        description: transactions.description,
        rawDescription: transactions.rawDescription,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
        categoryBudgetType: categories.budgetType,
        budgetTypeOverride: transactions.budgetTypeOverride,
        brandIcon: transactions.brandIcon,
        brandIconColor: transactions.brandIconColor,
        brandIconBgColor: transactions.brandIconBgColor,
        bankName: banks.displayName,
        notes: transactions.notes,
        customName: transactions.customName,
        receiptUrl: transactions.receiptUrl,
        excludeFromReports: transactions.excludeFromReports,
        isReimbursement: transactions.isReimbursement,
        isInternalTransfer: isInternalTransferExpr,
        transferType: effectiveTransferTypeExpr,
        goalId: transactions.goalId,
        recurringItemId: transactions.recurringItemId,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(banks, eq(transactions.account, banks.accountNumber))
      .where(and(gt(transactions.date, cashFlow.from), lte(transactions.date, cashFlow.to))),
    db.select().from(goalsTable).where(and(eq(goalsTable.goalType, "savings"), eq(goalsTable.active, true))),
  ]);

  const CashFlowStatusIcon = CASH_FLOW_STATUS[cashFlow.status].icon;

  const categoriesById = new Map(allCategories.map((c) => [c.id, c]));
  const variableCats = allCategories.filter((c) => c.budgetType === "nodig" || c.budgetType === "willen" || c.budgetType === "sparen");

  // Recurring items no longer carry their own icon — resolve it from an auto-detected
  // brand or the linked category, and stash the resolved values back onto each item so
  // every downstream card renders the inherited icon.
  const items = itemsRaw.map((it) => {
    const ic = resolveRecurringIcon(it, categoriesById);
    return { ...it, icon: ic.iconKey ?? null, iconColor: ic.color, iconBackground: ic.background };
  });

  const overrideLookup = buildOverrideLookup(overridesRaw);

  const savingsOverrideLookup = new Map<string, number>(
    savingsOverridesRaw.map((o) => [`${o.goalId}:${o.month}`, o.overrideAmount]),
  );

  function getSavingsEffective(goal: SavingsGoal, month: string): number {
    const key = `${goal.id}:${month}`;
    return savingsOverrideLookup.has(key) ? savingsOverrideLookup.get(key)! : (goal.monthlyContribution ?? 0);
  }

  // Variable budget targets: defaults filled by month-specific (month-specific wins)
  const defaultBudgetTargetMap = new Map(defaultBudgetTargets.map((t) => [t.categoryId, t.targetAmount]));
  const budgetTargetMap = new Map([
    ...defaultBudgetTargets.map((t) => [t.categoryId, t.targetAmount] as [number | null, number]),
    ...monthBudgetTargets.map((t) => [t.categoryId, t.targetAmount] as [number | null, number]),
  ]);
  const variableOverrideLookup = new Map(variableOverridesRaw.map((o) => [o.categoryId, o.overrideAmount]));
  const variableBudgetRows = variableCats
    .map((c) => ({
      ...c,
      budgetAmount: budgetTargetMap.get(c.id) ?? 0,
      overrideAmount: variableOverrideLookup.has(c.id) ? variableOverrideLookup.get(c.id)! : null,
      effectiveAmount: variableOverrideLookup.has(c.id) ? variableOverrideLookup.get(c.id)! : (budgetTargetMap.get(c.id) ?? 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const totalVariableBudget = variableBudgetRows.reduce((s, r) => s + r.effectiveAmount, 0);

  // Parent/subcategory tree for the "Categories" section — a row counts as top-level
  // if it has no parent, or its parent isn't itself a budgeted category (so it isn't
  // silently dropped for lacking a card to nest under).
  const variableRowIds = new Set(variableBudgetRows.map((r) => r.id));
  const variableTopLevel = variableBudgetRows.filter((r) => r.parentCategoryId === null || !variableRowIds.has(r.parentCategoryId));
  const variableChildrenByParentId = new Map<number, typeof variableBudgetRows>();
  for (const r of variableBudgetRows) {
    if (r.parentCategoryId !== null && variableRowIds.has(r.parentCategoryId)) {
      const arr = variableChildrenByParentId.get(r.parentCategoryId) ?? [];
      arr.push(r);
      variableChildrenByParentId.set(r.parentCategoryId, arr);
    }
  }

  const incomeItems  = items.filter((i) => i.type === "income");
  const expenseItems = items.filter((i) => (EXPENSE_TYPES as readonly string[]).includes(i.type));

  const savingsTotal = goals.reduce((s, g) => s + getSavingsEffective(g, baseMonth), 0);

  const totalIncome   = incomeItems.reduce((s, i) => s + getEffectiveMonthly(i, baseMonth, overrideLookup), 0);
  const totalRecurringExpenses = expenseItems.reduce((s, i) => s + getEffectiveMonthly(i, baseMonth, overrideLookup), 0);
  const totalExpenses = totalRecurringExpenses + savingsTotal + totalVariableBudget;
  const vrij          = totalIncome - totalExpenses;

  // "vs previous month" comparison — default amounts only (no override lookup, since
  // overrides are only fetched for [baseMonth, baseMonth+11]); a lightweight trend
  // indicator, not a pixel-perfect recompute.
  const prevTotalIncome = incomeItems.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
  const prevTotalRecurringExpenses = expenseItems.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
  const prevSavingsTotal = goals.reduce((s, g) => s + (g.monthlyContribution ?? 0), 0);
  const prevTotalVariableBudget = variableCats.reduce((s, c) => s + (defaultBudgetTargetMap.get(c.id) ?? 0), 0);
  const prevTotalExpenses = prevTotalRecurringExpenses + prevSavingsTotal + prevTotalVariableBudget;
  const prevVrij = prevTotalIncome - prevTotalExpenses;

  const incomeChange = pctChangeLabel(totalIncome, prevTotalIncome);
  const expensesChange = pctChangeLabel(totalExpenses, prevTotalExpenses);
  const recurringExpensesChange = pctChangeLabel(totalRecurringExpenses, prevTotalRecurringExpenses);
  const vrijChange = pctChangeLabel(vrij, prevVrij);

  const typeTotals: Record<string, number> = {};
  for (const item of expenseItems) {
    typeTotals[item.type] = (typeTotals[item.type] ?? 0) + getEffectiveMonthly(item, baseMonth, overrideLookup);
  }

  const donutSegments = [
    ...EXPENSE_TYPES
      .filter((type) => (typeTotals[type] ?? 0) > 0)
      .map((type) => ({ name: t(`types.${type}`), value: typeTotals[type] ?? 0, color: TYPE_COLORS[type] })),
    ...(savingsTotal > 0 ? [{ name: t("types.savings"), value: savingsTotal, color: TYPE_COLORS.savings }] : []),
    ...(totalVariableBudget > 0 ? [{ name: t("variableExpenses"), value: totalVariableBudget, color: TYPE_COLORS.budget }] : []),
    ...(vrij > 0 ? [{ name: t("freeToSpend"), value: vrij, color: TYPE_COLORS.vrij }] : []),
  ];

  const balanceData = buildProjection(items, baseMonth, overrideLookup, 12, (m) => goals.reduce((s, g) => s + getSavingsEffective(g, m), 0), totalVariableBudget);

  // Projected balance anchor — current net worth (same figure as the Net worth tab).
  // netWorthData.netWorth already counts money owed to the user (direction "owed") as an
  // asset (see getDebtSummary / computeNetWorth), so the anchor is just the net worth.
  const balanceAnchor = netWorthData.netWorth;
  const balanceHistory = [{ date: `${baseMonth}-01`, netWorth: Math.round(balanceAnchor) }];
  const balanceForecast = balanceData.map((d, i) => ({
    date: `${offsetMonth(baseMonth, i + 1)}-01`,
    netWorth: Math.round(balanceAnchor + d.balance),
  }));

  const variableNeedsBudget  = variableBudgetRows.filter((r) => r.budgetType === "nodig").reduce((s, r) => s + r.effectiveAmount, 0);
  const variableWantsBudget  = variableBudgetRows.filter((r) => r.budgetType === "willen").reduce((s, r) => s + r.effectiveAmount, 0);
  const variableSparenBudget = variableBudgetRows.filter((r) => r.budgetType === "sparen").reduce((s, r) => s + r.effectiveAmount, 0);

  const needsTotal  = expenseItems.filter((i) => i.budgetType === "nodig").reduce((s, i) => s + getEffectiveMonthly(i, baseMonth, overrideLookup), 0) + variableNeedsBudget;
  const wantsTotal  = expenseItems.filter((i) => i.budgetType === "willen").reduce((s, i) => s + getEffectiveMonthly(i, baseMonth, overrideLookup), 0) + variableWantsBudget;
  const savingsTot  = savingsTotal + expenseItems.filter((i) => i.budgetType === "sparen").reduce((s, i) => s + getEffectiveMonthly(i, baseMonth, overrideLookup), 0) + variableSparenBudget;

  const needsPct   = totalIncome > 0 ? Math.min(100, (needsTotal  / totalIncome) * 100) : 0;
  const wantsPct   = totalIncome > 0 ? Math.min(100, (wantsTotal  / totalIncome) * 100) : 0;
  const savingsPct = totalIncome > 0 ? Math.min(100, (savingsTot  / totalIncome) * 100) : 0;

  const label = monthLabel(baseMonth, dateLocale);
  const statusTone = cashFlow.status === "healthy" ? "positive" : cashFlow.status === "warning" ? "warning" : cashFlow.status === "critical" ? "negative" : "neutral";
  const nextEvents = cashFlow.events.slice(0, 6);
  const shortDay = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" });

  return (
    // Standalone (/forecast) this is the whole page, so it brings the page gutters;
    // inside Insights the PageShell already has them.
    <div className={cn("flex flex-col gap-5", !embedded && "px-5 pb-28 pt-[var(--sat)] lg:px-9 lg:pt-6")}>
      {!embedded && (
        <div className="sticky z-40 bg-bg py-2" style={{ top: stickyTop }}>
          <BudgetTabs />
        </div>
      )}
      {/* Embedded, the picker keeps the month in a cookie instead of the URL — the
          portal shares the dashboard's "/" route, so a param there would show up in
          the address bar of the whole app. See the picker's own `embedded` docs. */}
      <PrognosePeriodPicker current={baseMonth} embedded={embedded} aboveNav={dockAboveNav} />

      <div className={SPLIT_GRID}>
        <div className="flex min-w-0 flex-col gap-5">
          {/* The cash flow forecast: where the balance goes over the next 90 days,
              its lowest point, the safety line and the verdict. Day-level, always
              from today — not driven by the month picker. */}
          <section className={cn(CARD, "flex flex-col gap-4 p-[18px] lg:px-6 lg:py-[22px]")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-ink-2">{t("projectedTitle", { days: FORECAST_HORIZON_DAYS })}</span>
                {cashFlow.lowest ? (
                  <span className="amount text-[34px] leading-none tracking-[-0.035em] text-ink lg:text-[44px]">
                    {t("lowest", { amount: signedForecastEur(cashFlow.lowest.amount) })}{" "}
                    <span className="text-base font-semibold text-ink-3 lg:text-lg">{t("onDate", { date: shortDay(cashFlow.lowest.date) })}</span>
                  </span>
                ) : (
                  <span className="amount text-[34px] leading-none text-ink lg:text-[44px]">{signedForecastEur(cashFlow.current)}</span>
                )}
                <span className="text-xs text-ink-3">
                  {cashFlow.hasStartingBalance ? t("currentLabel") : t("projectedLabel")}: <span className="font-semibold text-ink-2">{signedForecastEur(cashFlow.current)}</span>
                </span>
              </div>
              <Pill tone={statusTone} icon={<CashFlowStatusIcon />}>
                {t(`status.${cashFlow.status}`)}
              </Pill>
            </div>
            <p className="text-[13px] text-ink-2">{cashFlow.message}</p>
            <p className="text-xs text-ink-3">{cashFlow.hasStartingBalance ? t("balanceNote") : t("cumulativeNote")}</p>
            <CashFlowChart points={cashFlow.points} events={cashFlow.events} lowest={cashFlow.lowest} threshold={cashFlow.warningThreshold} />
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              <span className="mono-label inline-flex items-center gap-1.5 text-[10px] text-ink"><span className="h-0.5 w-3 rounded-full bg-ink" />{t("legend.expected")}</span>
              <span className="mono-label inline-flex items-center gap-1.5 text-[10px] text-negative"><span className="w-3 border-t-2 border-dashed border-negative" />{t("legend.safety", { amount: formatEurWhole(cashFlow.warningThreshold) })}</span>
              <span className="mono-label inline-flex items-center gap-1.5 text-[10px]"><span className="size-2 rounded-full bg-warning" />{t("legend.lowest")}</span>
              <span className="mono-label inline-flex items-center gap-1.5 text-[10px]"><span className="size-2 rounded-full bg-positive" />{t("legend.in")}</span>
              <span className="mono-label inline-flex items-center gap-1.5 text-[10px]"><span className="size-2 rounded-full bg-ink" />{t("legend.today")}</span>
            </div>
          </section>

          {/* The cash flow figures for the same 90 days. */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5 lg:gap-3">
            <Stat
              label={t("nextIncome")}
              value={cashFlow.nextIncome ? `${formatEurWhole(cashFlow.nextIncome.amount)} · ${new Date(`${cashFlow.nextIncome.date}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}` : "—"}
              tone="positive"
            />
            <Stat label={t("expectedIn")} value={formatEur(cashFlow.totalIncome)} />
            <Stat label={t("expectedOut")} value={formatEur(cashFlow.totalExpenses)} />
            <Stat label={t("netChange")} value={`${cashFlow.netChange >= 0 ? "+" : "-"}${formatEur(Math.abs(cashFlow.netChange))}`} tone={cashFlow.netChange >= 0 ? "positive" : "negative"} />
            <Stat label={t("savingsPlanned")} value={formatEur(savingsTotal)} tone="accent" className="col-span-2 md:col-span-1" />
          </div>

          {/* The selected month's plan — the month picker drives everything from here down. */}
          <section className={cn(CARD, "flex flex-col gap-3 p-[18px] lg:px-5")}>
            <SectionHead title={t("monthPlan", { month: label })} size="sm" />
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <PlanTile label={t("plan.income")} value={formatEur(totalIncome)} change={incomeChange} noData={t("noPrevious")} />
              <PlanTile label={t("plan.recurring")} value={formatEur(totalExpenses)} change={expensesChange ? { ...expensesChange, up: !expensesChange.up } : null} noData={t("noPrevious")} />
              <PlanTile label={t("plan.freeInclSaves")} value={formatEur(totalRecurringExpenses)} change={recurringExpensesChange ? { ...recurringExpensesChange, up: !recurringExpensesChange.up } : null} noData={t("noPrevious")} />
              <PlanTile label={t("plan.free")} value={formatEur(vrij)} change={vrijChange} noData={t("noPrevious")} />
            </div>
          </section>

          {totalIncome > 0 && (
            <div className="grid gap-5 xl:grid-cols-2">
              <section className={cn(CARD, "flex flex-col gap-3 p-[18px] lg:px-5")}>
                <SectionHead title={t("distribution")} size="sm" />
                <p className="-mt-1 text-xs text-ink-3">{t("distributionNote", { month: label })}</p>
                <ExpenseDonutChart segments={donutSegments} />
              </section>

              {/* Needs / wants / savings against the budget strategy. */}
              <section className={cn(CARD, "flex flex-col gap-3 p-[18px] lg:px-5")}>
                <SectionHead title={t("budgetDistribution")} size="sm" />
                <p className="-mt-1 text-xs text-ink-3">{t("strategyNote", { needs: strategy.nodig, wants: strategy.willen, savings: strategy.sparen })}</p>
                <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full bg-surface-2">
                  {needsTotal > 0 && <div className="rounded-full" style={{ width: `${needsPct}%`, backgroundColor: "var(--arca-info)" }} />}
                  {wantsTotal > 0 && <div className="rounded-full" style={{ width: `${wantsPct}%`, backgroundColor: "var(--arca-accent)" }} />}
                  {savingsTot > 0 && <div className="rounded-full" style={{ width: `${savingsPct}%`, backgroundColor: "var(--arca-positive)" }} />}
                </div>
                <div className="flex flex-col gap-2.5">
                  {[
                    { key: "needs", amount: needsTotal, pct: needsPct, target: strategy.nodig, color: "var(--arca-info)" },
                    { key: "wants", amount: wantsTotal, pct: wantsPct, target: strategy.willen, color: "var(--arca-accent)" },
                    { key: "savings", amount: savingsTot, pct: savingsPct, target: strategy.sparen, color: "var(--arca-positive)" },
                  ].map((item) => (
                    <div key={item.key} className="flex min-w-0 items-center gap-2.5">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="truncate text-sm font-semibold text-ink">{t(`strategy.${item.key}`)}</span>
                      <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums text-ink">{formatEur(item.amount)}</span>
                      <span className={cn("w-10 shrink-0 text-right text-sm font-semibold tabular-nums", item.pct > item.target ? "text-negative" : "text-ink-2")}>{item.pct.toFixed(0)}%</span>
                      <span className="shrink-0 text-xs tabular-nums text-ink-3">/{item.target}%</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* Projected balance — net worth projected forward month by month. */}
          {totalIncome > 0 && (
            <section className={cn(CARD, "flex flex-col gap-2 p-[18px] lg:px-5")}>
              <SectionHead title={t("projectedBalance")} size="sm" />
              <p className="-mt-1 text-xs text-ink-3">{t("projectedBalanceNote")}</p>
              <NetWorthTrendChart data={balanceHistory} forecast={balanceForecast} />
            </section>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {/* What is coming — the first events of the forecast. */}
          <section data-tip-anchor="insightsComingUp" className={cn(CARD, "flex flex-col gap-1.5 px-[18px] py-4 lg:px-5")}>
            <SectionHead title={t("comingUp")} size="sm" link={t("calendar")} href="#forecast-calendar" />
            {nextEvents.length === 0 ? (
              <p className="py-2 text-[13px] text-ink-3">{t("nothingScheduled")}</p>
            ) : (
              nextEvents.map((e) => (
                <div key={e.key} className="flex min-h-[52px] items-center gap-3">
                  <CategoryIcon icon={e.icon} color={e.iconColor} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-ink">{e.name}</span>
                    <span className="text-xs text-ink-3">{shortDay(e.date)}{e.kind === "recurring" ? ` · ${t("projected")}` : ""}</span>
                  </span>
                  <span className={cn("shrink-0 text-sm font-semibold tabular-nums", e.amount >= 0 ? "text-positive" : "text-ink")}>
                    {e.amount >= 0 ? "+" : "-"}
                    {formatEur(Math.abs(e.amount))}
                  </span>
                </div>
              ))
            )}
            <p className="pt-1.5 text-xs leading-[1.5] text-ink-3">{t("comingUpNote")}</p>
          </section>

          <AnchoredTip id="insightsComingUp" anchor="insightsComingUp" active={nextEvents.length > 0} />

          {/* Cash flow calendar + upcoming events — collapsed by default, matching the
              Categories / Recurring items sections below. */}
          <CollapsibleSection title={t("calendarTitle")} id="forecast-calendar">
            <p className="mb-4 text-xs text-ink-3">{t("calendarNote")}</p>
            <CashFlowCalendar points={cashFlow.points} month={baseMonth} />
          </CollapsibleSection>

          <CollapsibleSection title={t("upcomingTitle")}>
            <CashFlowEvents
              events={cashFlow.events}
              transactions={cashFlowTxRows as TransactionDetail[]}
              categories={allCategories}
              savingsGoals={cashFlowSavingsGoals}
            />
          </CollapsibleSection>

          {/* Categories — the budgeted-category tree, each parent its own card with a
              chevron toggling its subcategories; tap one to override it for the month. */}
          {variableBudgetRows.length > 0 && (
            <CollapsibleSection title={t("categories")} total={totalVariableBudget}>
              <div className="space-y-2">
                {variableTopLevel.map((cat) => (
                  <CategoryCard key={cat.id} category={cat} subcategories={variableChildrenByParentId.get(cat.id) ?? []} month={baseMonth} />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Recurring items — grouped by real category, each item its own tappable card
              (tap to change the amount for this month only). */}
          {(incomeItems.length > 0 || expenseItems.length > 0 || goals.length > 0) && (
            <CollapsibleSection title={t("recurringItems")}>
              <div className="space-y-2">
                {incomeItems.length > 0 && (
                  <TypeSection title={t("types.income")}>
                    {groupByCategory(incomeItems, categoriesById, t("otherIncome")).map((group) => (
                      <CategoryGroup key={group.key} name={group.name}>
                        {group.items.map((item) => <ItemCard key={item.id} item={item} month={baseMonth} overrideLookup={overrideLookup} perMonth={perMonth} freqLabel={freqLabel} />)}
                      </CategoryGroup>
                    ))}
                  </TypeSection>
                )}
                {EXPENSE_TYPES.map((type) => {
                  const typeItems = expenseItems.filter((i) => i.type === type);
                  if (typeItems.length === 0) return null;
                  return (
                    <TypeSection key={type} title={t(`types.${type}`)}>
                      {groupByCategory(typeItems, categoriesById, t("otherOf", { type: t(`types.${type}`).toLowerCase() })).map((group) => (
                        <CategoryGroup key={group.key} name={group.name}>
                          {group.items.map((item) => <ItemCard key={item.id} item={item} month={baseMonth} overrideLookup={overrideLookup} perMonth={perMonth} freqLabel={freqLabel} />)}
                        </CategoryGroup>
                      ))}
                    </TypeSection>
                  );
                })}
                {goals.length > 0 && (
                  <TypeSection title={t("types.savings")}>
                    {goals.map((goal) => (
                      <SavingsGoalCard key={goal.id} goal={goal} month={baseMonth} savingsOverrideLookup={savingsOverrideLookup} perMonth={perMonth} />
                    ))}
                  </TypeSection>
                )}
              </div>
            </CollapsibleSection>
          )}

          {items.length === 0 && goals.length === 0 && (
            <div className="rounded-card border border-dashed border-line p-8 text-center text-[13px] text-ink-3">
              <p className="mb-1">{t("noItems")}</p>
              <Link href="/settings?tab=recurring" className="font-semibold text-mustard-strong hover:underline">
                {t("manageRecurring")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Month plan tile ────────────────────────────────────────────────────────────

function PlanTile({ label, value, change, noData }: { label: string; value: string; change: { label: string; up: boolean } | null; noData: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-tile bg-surface-2 px-3.5 py-3">
      <span className="mono-label truncate text-[10px]">{label}</span>
      <span className="amount truncate text-[17px] tabular-nums text-ink">{value}</span>
      {change ? <ChangePill change={change} /> : <span className="truncate text-[11px] text-ink-3">{noData}</span>}
    </div>
  );
}

// ─── Item card ──────────────────────────────────────────────────────────────────

function ItemCard({
  item, month, overrideLookup, perMonth, freqLabel,
}: {
  item: RecurringItem & { icon: string | null; iconColor: string | null; iconBackground?: string | null };
  month: string;
  overrideLookup: Map<string, number>;
  perMonth: (amount: string) => string;
  freqLabel: (frequency: string) => string;
}) {
  const defaultMonthly = toMonthly(item.amount, item.frequency);
  const overrideKey    = `${item.id}:${month}`;
  const overrideAmount = overrideLookup.has(overrideKey) ? overrideLookup.get(overrideKey)! : null;
  const effectiveMonthly = overrideAmount ?? defaultMonthly;
  const isNonMonthly   = item.frequency !== "monthly" && item.amount && overrideAmount === null;

  return (
    <PrognoseOverrideBtn
      itemId={item.id}
      itemName={item.name}
      month={month}
      defaultAmount={defaultMonthly}
      overrideAmount={overrideAmount}
      icon={<CategoryIcon icon={item.icon} color={item.iconColor} size="sm" />}
      subtitle={
        item.amount || overrideAmount !== null ? (
          <>
            {perMonth(formatEur(effectiveMonthly))}
            {isNonMonthly && ` · ${formatEur(item.amount!)} /${freqLabel(item.frequency)}`}
          </>
        ) : "—"
      }
    />
  );
}

// ─── Savings goal card ────────────────────────────────────────────────────────

function SavingsGoalCard({ goal, month, savingsOverrideLookup, perMonth }: {
  goal: SavingsGoal;
  month: string;
  savingsOverrideLookup: Map<string, number>;
  perMonth: (amount: string) => string;
}) {
  const key = `${goal.id}:${month}`;
  const overrideAmount = savingsOverrideLookup.has(key) ? savingsOverrideLookup.get(key)! : null;
  const effective = overrideAmount ?? (goal.monthlyContribution ?? 0);
  return (
    <SavingsPrognoseOverrideBtn
      goalId={goal.id}
      goalName={goal.name}
      month={month}
      defaultAmount={goal.monthlyContribution ?? 0}
      overrideAmount={overrideAmount}
      icon={<CategoryIcon icon={goal.icon ?? "IconPigFilled"} color={goal.color ?? TYPE_COLORS.savings} size="sm" />}
      subtitle={perMonth(formatEur(effective))}
    />
  );
}

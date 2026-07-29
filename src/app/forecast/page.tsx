import { db } from "@/db";
import { recurringItems, prognoseOverrides, savingsGoals, savingsMonthOverrides, budgetTargets, categories, variablePrognoseOverrides, goals as goalsTable, transactions, banks } from "@/db/schema";
import { eq, and, gte, lte, gt } from "drizzle-orm";
import { formatEur, toMonthly, pctChangeLabel, MONTH_NAMES } from "@/lib/format";
import type { RecurringItem, PrognoseOverride, SavingsGoal, Category } from "@/db/schema";
import { PrognoseOverrideBtn } from "./forecast-override-btn";
import { SavingsPrognoseOverrideBtn } from "./savings-override-btn";
import { Icon } from "@/components/icon";
import {
  IconTrendingUp as TrendingUp,
  IconTrendingDown as TrendingDown,
  IconWallet as Wallet,
  IconScaleFilled as Scale,
  IconAlertTriangleFilled as AlertTriangle,
  IconArrowDownRight,
  IconArrowUpRight,
} from "@tabler/icons-react";
import { MonthPicker } from "@/components/month-picker";
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
import { StatTile, TileBadge } from "@/components/stat-tile";
import { ChangePill } from "@/components/change-pill";
import { getFinancialMonthConfig, getBudgetStrategy } from "@/lib/app-settings";
import { resolveRecurringIcon } from "@/lib/auto-brand";
import { currentFinancialMonth, financialMonthRangeByMonth } from "@/lib/date-range";
import { computeNetWorth } from "@/lib/net-worth-snapshots";
import { getCashFlowForecast, formatForecastDate, signedForecastEur, FORECAST_HORIZON_DAYS } from "@/lib/cash-flow-forecast";
import { isInternalTransferExpr, effectiveTransferTypeExpr } from "@/lib/internal-transfers";
import type { TransactionDetail } from "@/app/transactions/transaction-types";
import { ScrollStickyHeader } from "@/components/scroll-sticky-header";
import Link from "next/link";
import { BudgetTabs } from "@/app/budget/budget-tabs";

export const dynamic = "force-dynamic";

const EXPENSE_TYPES = ["bill", "subscription", "debt"] as const;

const TYPE_LABELS: Record<string, string> = {
  income:       "Income",
  bill:         "Recurring bills",
  subscription: "Subscriptions",
  debt:         "Debts",
  savings:      "Savings",
};

const TYPE_COLORS: Record<string, string> = {
  bill:         "#6366f1",
  subscription: "#a855f7",
  debt:         "#ef4444",
  savings:      "#14b8a6",
  income:       "#22c55e",
  vrij:         "#94a3b8",
  budget:       "#f97316",
};

// Forecast health, in the priority the cash flow section surfaces it: negative first,
// then the low-balance warning, then healthy. Colors reuse the app's semantic tokens
// so this matches the Budget distribution bars further down the tab.
const CASH_FLOW_STATUS = {
  healthy:  { label: "Healthy",  color: "var(--color-success)", icon: TrendingUp },
  warning:  { label: "Warning",  color: "var(--color-warning)", icon: AlertTriangle },
  critical: { label: "Critical", color: "var(--color-danger)",  icon: TrendingDown },
} as const;

const FREQ_LABELS: Record<string, string> = {
  yearly:    "jaar",
  quarterly: "kwartaal",
  weekly:    "week",
  once:      "eenmalig",
};

function offsetMonth(base: string, delta: number): string {
  const [y, m] = base.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
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
}) {
  const sp = await searchParams;
  const [financialMonth, strategy] = await Promise.all([getFinancialMonthConfig(), getBudgetStrategy()]);

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

  const cashFlowStatus = CASH_FLOW_STATUS[cashFlow.status];
  const CashFlowStatusIcon = cashFlowStatus.icon;
  const cashFlowLabel = cashFlow.hasStartingBalance ? "Current cash flow" : "Projected cash flow";

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
      .filter((t) => (typeTotals[t] ?? 0) > 0)
      .map((t) => ({ name: TYPE_LABELS[t], value: typeTotals[t] ?? 0, color: TYPE_COLORS[t] })),
    ...(savingsTotal > 0 ? [{ name: "Savings", value: savingsTotal, color: TYPE_COLORS.savings }] : []),
    ...(totalVariableBudget > 0 ? [{ name: "Variable expenses", value: totalVariableBudget, color: TYPE_COLORS.budget }] : []),
    ...(vrij > 0 ? [{ name: "Vrij besteedbaar", value: vrij, color: TYPE_COLORS.vrij }] : []),
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

  const label         = monthLabel(baseMonth);
  const range = financialMonthRangeByMonth(baseMonth, financialMonth);
  const rangeLabel = `${new Date(range.from + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(range.to + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

  return (
    <div className="-mt-14 lg:mt-0 min-h-screen">

      {/* Mobile top bar */}
      <div className="lg:hidden sticky z-40 bg-background px-4 pt-2 pb-3 space-y-2" style={{ top: stickyTop }}>
        {!embedded && <BudgetTabs />}
      </div>
      <PrognosePeriodPicker current={baseMonth} />

      {/* Desktop sticky header with month nav */}
      <ScrollStickyHeader
        className="hidden lg:block sticky top-0 z-10 px-6 md:px-8 py-4"
        scrolledClassName="bg-card/40 dark:bg-card/5 backdrop-blur-xl border-b border-white/30 dark:border-white/10"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground">Prognose</h1>
            <p className="text-sm text-muted-foreground">
              {rangeLabel}
            </p>
          </div>
          <MonthPicker current={baseMonth} variant="icon" />
        </div>
      </ScrollStickyHeader>

      <div className="px-4 pb-[calc(6rem+var(--sab))] lg:pb-6 md:px-6 lg:px-8 pt-3 space-y-3">

        {/* Summary — 4 stat tiles, same grid as the Trends page */}
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Income"
            value={formatEur(totalIncome)}
            valueClassName="text-xl font-bold tabular-nums"
            badge={<TileBadge icon={TrendingUp} color="var(--dialog-background)" />}
            footer={incomeChange ? <ChangePill change={incomeChange} /> : "vs previous month — no data"}
          />
          <StatTile
            label="Recurring bills"
            value={formatEur(totalExpenses)}
            valueClassName="text-xl font-bold tabular-nums"
            badge={<TileBadge icon={TrendingDown} color="var(--dialog-background)" />}
            footer={expensesChange ? <ChangePill change={{ ...expensesChange, up: !expensesChange.up }} /> : "vs previous month — no data"}
          />
          <StatTile
            label="Free to spend incl. saves"
            value={formatEur(totalRecurringExpenses)}
            valueClassName="text-xl font-bold tabular-nums text"
            badge={<TileBadge icon={Wallet} color="var(--dialog-background)" />}
            footer={recurringExpensesChange ? <ChangePill change={{ ...recurringExpensesChange, up: !recurringExpensesChange.up }} /> : "vs previous month — no data"}
          />
          <StatTile
            label="Free to spend"
            value={formatEur(vrij)}
            valueClassName="text-xl font-bold tabular-nums"
            badge={<TileBadge icon={Scale} color="var(--dialog-background)" />}
            footer={vrijChange ? <ChangePill change={vrijChange} /> : "vs previous month — no data"}
          />
        </div>

        {/* Verdeling inkomen — same plain-card style as "Expenses per category"
            (src/app/reports/top-expense-categories-card.tsx). */}
        {totalIncome > 0 && (
          <div className="rounded-2xl bg-[var(--dialog-content-background)] p-5">
            <h2 className="text-sm font-semibold pb-1">Distribution of income</h2>
            <p className="text-xs text-foreground/60 mb-2">How your income is distributed over {label}</p>
            <ExpenseDonutChart segments={donutSegments} />
          </div>
        )}

        {/* Projected balance — same nested two-tone shell + line chart as the Net
            worth tab's own chart. */}
        {totalIncome > 0 && (
          <div className="bg-[var(--dialog-content-background)] p-1 rounded-2xl">
            <div className="rounded-b-sm rounded-t-2xl bg-[var(--dialog-background)]/60 dark:bg-[var(--dialog-background)]/30 py-2 px-4 pb-3">
              <p className="text-md mb-1">Projected balance — 12 months</p>
              <p className="text-xs text-muted-foreground mb-2">Net worth + what&apos;s owed to you, projected forward</p>
              <NetWorthTrendChart data={balanceHistory} forecast={balanceForecast} />
            </div>
          </div>
        )}

        {/* ── Cash flow forecast ────────────────────────────────────────────────
            Day-level view: where the money actually lands over the next 90 days,
            complementing the month-level projection above. Same nested two-tone
            chart shell as "Projected balance". */}
        <div className="bg-[var(--dialog-content-background)] p-1 rounded-2xl">
          <div className="rounded-b-sm rounded-t-2xl bg-[var(--dialog-background)]/60 dark:bg-[var(--dialog-background)]/30 py-2 px-4 pb-3">
            <p className="text-md mb-1">Cash flow forecast — {FORECAST_HORIZON_DAYS} days</p>
            <p className="text-xs text-muted-foreground mb-2">
              {cashFlow.hasStartingBalance
                ? "Your balance, projected forward through upcoming income and bills"
                : "Cumulative projected cash flow — no account balance is set, so this is not a balance"}
            </p>

            <div className="flex items-baseline gap-2 mb-1">
              <p className="text-2xl font-bold tabular-nums tracking-tight">{signedForecastEur(cashFlow.current)}</p>
              <span className="text-xs text-foreground/50">{cashFlowLabel}</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <CashFlowStatusIcon className="size-3.5 shrink-0" style={{ color: cashFlowStatus.color }} />
              <p className="text-xs" style={{ color: cashFlowStatus.color }}>{cashFlow.message}</p>
            </div>

            <CashFlowChart points={cashFlow.points} events={cashFlow.events} lowest={cashFlow.lowest} />

            <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full inline-block" style={{ backgroundColor: "var(--color-income)" }} />
                Money in
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full inline-block" style={{ backgroundColor: "var(--color-expense)" }} />
                Money out
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full inline-block bg-current" />
                Today
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full inline-block" style={{ backgroundColor: "var(--color-warning)" }} />
                Lowest point
              </span>
            </div>
          </div>
        </div>

        {/* Cash flow summary — same row treatment as "Budget distribution" below. */}
        <div className="rounded-2xl bg-[var(--dialog-content-background)] p-5 space-y-4">
          <div>
            <p className="text-md mb-1">Cash flow summary</p>
            <p className="text-xs text-muted-foreground">Next {FORECAST_HORIZON_DAYS} days, from today</p>
          </div>
          <div className="flex flex-col gap-2.5">
            <CashFlowRow label={cashFlowLabel} value={signedForecastEur(cashFlow.current)} />
            <CashFlowRow
              label="Lowest point"
              value={cashFlow.lowest ? signedForecastEur(cashFlow.lowest.amount) : "—"}
              hint={cashFlow.lowest ? formatForecastDate(cashFlow.lowest.date) : undefined}
              color={cashFlow.lowest && cashFlow.lowest.amount < 0 ? "var(--color-danger)" : undefined}
            />
            <CashFlowRow label="Expected income" value={formatEur(cashFlow.totalIncome)} color="var(--color-income)" />
            <CashFlowRow label="Expected expenses" value={formatEur(cashFlow.totalExpenses)} color="var(--color-expense)" />
            <CashFlowRow
              label="Next income"
              value={cashFlow.nextIncome ? formatEur(cashFlow.nextIncome.amount) : "—"}
              hint={cashFlow.nextIncome ? `${cashFlow.nextIncome.name} · ${formatForecastDate(cashFlow.nextIncome.date)}` : undefined}
            />
            <CashFlowRow label="Forecast status" value={cashFlowStatus.label} color={cashFlowStatus.color} />
          </div>
        </div>

        {/* Income vs expenses over the horizon */}
        <div className="rounded-2xl bg-[var(--dialog-content-background)] p-5 space-y-4">
          <div>
            <p className="text-md mb-1">Expected income vs expenses</p>
            <p className="text-xs text-muted-foreground">Everything scheduled in the forecast period</p>
          </div>
          <div className="flex flex-col gap-3">
            {[
              { label: "Income", amount: cashFlow.totalIncome, color: "var(--color-income)", icon: IconArrowUpRight },
              { label: "Expenses", amount: cashFlow.totalExpenses, color: "var(--color-expense)", icon: IconArrowDownRight },
            ].map((bar) => {
              const peak = Math.max(cashFlow.totalIncome, cashFlow.totalExpenses, 1);
              const BarIcon = bar.icon;
              return (
                <div key={bar.label}>
                  <div className="flex items-center gap-2.5 min-w-0 mb-1.5">
                    <BarIcon className="size-3.5 shrink-0" style={{ color: bar.color }} />
                    <span className="text-sm font-medium truncate">{bar.label}</span>
                    <span className="text-sm font-semibold tabular-nums shrink-0 ml-auto" style={{ color: bar.color }}>
                      {formatEur(bar.amount)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-foreground/5">
                    <div className="h-full rounded-full" style={{ width: `${(bar.amount / peak) * 100}%`, backgroundColor: bar.color }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2.5 pt-1">
            <span className="text-sm font-medium">Net change</span>
            <span
              className="text-sm font-semibold tabular-nums ml-auto"
              style={{ color: cashFlow.netChange >= 0 ? "var(--color-income)" : "var(--color-expense)" }}
            >
              {cashFlow.netChange >= 0 ? "+" : "−"}{formatEur(Math.abs(cashFlow.netChange))}
            </span>
          </div>
        </div>

        {/* Cash flow calendar + upcoming events — collapsed by default, matching the
            Categories / Recurring items sections at the bottom of this tab. */}
        <CollapsibleSection title="Cash flow calendar">
          <div className="rounded-2xl bg-[var(--dialog-content-background)] p-5">
            <p className="text-xs text-muted-foreground mb-4">Days with money moving in or out</p>
            <CashFlowCalendar points={cashFlow.points} />
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Upcoming cash flow">
          <CashFlowEvents
            events={cashFlow.events}
            transactions={cashFlowTxRows as TransactionDetail[]}
            categories={allCategories}
            savingsGoals={cashFlowSavingsGoals}
          />
        </CollapsibleSection>

        {/* Budget health — verdeling style matching debt page */}
        {totalIncome > 0 && (
          <div className="rounded-2xl bg-[var(--dialog-content-background)] p-5 space-y-4">
            <p className="text-md mb-1">Budget distribution</p>
            <p className="text-xs text-muted-foreground mb-2">Your budget is currently set to ({strategy.nodig}/{strategy.willen}/{strategy.sparen})</p>
            <div className="h-2 rounded-full overflow-hidden flex gap-0.5 bg-foreground/5 mt-3">
              {needsTotal > 0 && <div className="rounded-full" style={{ width: `${needsPct}%`, backgroundColor: "var(--color-danger)" }} />}
              {wantsTotal > 0 && <div className="rounded-full" style={{ width: `${wantsPct}%`, backgroundColor: "var(--color-warning)" }} />}
              {savingsTot > 0 && <div className="rounded-full" style={{ width: `${savingsPct}%`, backgroundColor: "var(--color-success)" }} />}
            </div>
            <div className="flex flex-col gap-2.5">
              {[
                { label: "Needs", amount: needsTotal, pct: needsPct, target: strategy.nodig, color: "var(--color-danger)" },
                { label: "Wants", amount: wantsTotal, pct: wantsPct, target: strategy.willen, color: "var(--color-warning)" },
                { label: "Savings", amount: savingsTot, pct: savingsPct, target: strategy.sparen, color: "var(--color-success)" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2.5 min-w-0">
                  <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-sm font-medium truncate">{item.label}</span>
                  <span className="text-sm font-semibold tabular-nums shrink-0 ml-auto">{formatEur(item.amount)}</span>
                  <span className={`text-sm tabular-nums shrink-0 w-10 text-right font-medium ${item.pct > item.target ? "text-red-500" : "text-foreground/60"}`}>{item.pct.toFixed(0)}%</span>
                  <span className="text-xs text-foreground/40 tabular-nums shrink-0">/{item.target}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Categories — the real budgeted-category tree (Settings → Categories), each
            parent category its own card (same shape as the category selector) with a
            chevron toggling its subcategories. */}
        {variableBudgetRows.length > 0 && (
          <CollapsibleSection title="Categories" total={totalVariableBudget}>
            <div className="space-y-2">
              {variableTopLevel.map((cat) => (
                <CategoryCard key={cat.id} category={cat} subcategories={variableChildrenByParentId.get(cat.id) ?? []} month={baseMonth} />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Recurring items — grouped by real category (not the old hardcoded type
            labels), each item its own tappable card. Collapsible as a whole,
            separately from the Categories tree above. */}
        {(incomeItems.length > 0 || expenseItems.length > 0 || goals.length > 0) && (
          <CollapsibleSection title="Recurring items">
            <div className="space-y-2">
              {incomeItems.length > 0 && (
                <TypeSection title={TYPE_LABELS.income}>
                  {groupByCategory(incomeItems, categoriesById, "Other income").map((group) => (
                    <CategoryGroup key={group.key} name={group.name}>
                      {group.items.map((item) => <ItemCard key={item.id} item={item} month={baseMonth} overrideLookup={overrideLookup} />)}
                    </CategoryGroup>
                  ))}
                </TypeSection>
              )}
              {EXPENSE_TYPES.map((type) => {
                const typeItems = expenseItems.filter((i) => i.type === type);
                if (typeItems.length === 0) return null;
                return (
                  <TypeSection key={type} title={TYPE_LABELS[type]}>
                    {groupByCategory(typeItems, categoriesById, `Other ${TYPE_LABELS[type].toLowerCase()}`).map((group) => (
                      <CategoryGroup key={group.key} name={group.name}>
                        {group.items.map((item) => <ItemCard key={item.id} item={item} month={baseMonth} overrideLookup={overrideLookup} />)}
                      </CategoryGroup>
                    ))}
                  </TypeSection>
                );
              })}
              {goals.length > 0 && (
                <TypeSection title="Savings">
                  {goals.map((goal) => (
                    <SavingsGoalCard key={goal.id} goal={goal} month={baseMonth} savingsOverrideLookup={savingsOverrideLookup} />
                  ))}
                </TypeSection>
              )}
            </div>
          </CollapsibleSection>
        )}

        {items.length === 0 && goals.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            <p className="mb-1">No active fixed items found.</p>
            <Link href="/settings?tab=recurring" className="text-primary hover:underline">
              Admin vaste kosten →
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Cash flow summary row ──────────────────────────────────────────────────────
// Same shape as the Budget distribution rows: label left, value pushed right with
// ml-auto, optional muted hint under the value.

function CashFlowRow({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="text-sm font-medium truncate">{label}</span>
      <span className="ml-auto shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums" style={color ? { color } : undefined}>{value}</span>
        {hint && <span className="block text-xs text-foreground/40">{hint}</span>}
      </span>
    </div>
  );
}

// ─── Item card ──────────────────────────────────────────────────────────────────

function ItemCard({
  item, month, overrideLookup,
}: {
  item: RecurringItem & { icon: string | null; iconColor: string | null; iconBackground?: string | null };
  month: string;
  overrideLookup: Map<string, number>;
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
      icon={<Icon iconKey={item.icon} color={item.iconColor} background={item.iconBackground} round size="sm" />}
      subtitle={
        item.amount || overrideAmount !== null ? (
          <>
            {formatEur(effectiveMonthly)}/mnd
            {isNonMonthly && ` · ${formatEur(item.amount!)} /${FREQ_LABELS[item.frequency] ?? item.frequency}`}
          </>
        ) : "—"
      }
    />
  );
}

// ─── Savings goal card ────────────────────────────────────────────────────────

function SavingsGoalCard({ goal, month, savingsOverrideLookup }: {
  goal: SavingsGoal;
  month: string;
  savingsOverrideLookup: Map<string, number>;
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
      icon={<Icon iconKey={goal.icon ?? "IconPigFilled"} color={goal.color ?? TYPE_COLORS.savings} round size="sm" />}
      subtitle={`${formatEur(effective)}/mnd`}
    />
  );
}

import { db } from "@/db";
import { transactions, categories, recurringItems, budgets, vermogenAccounts } from "@/db/schema";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { isInternalTransferExpr } from "@/lib/internal-transfers";
import { getTransactionSplitRows } from "@/lib/transaction-split-queries";
import { buildSplitAllocations, groupTransactionSplits } from "@/lib/transaction-splits";
import { getBankBalances } from "@/lib/account-balances";
import { getDebtSummary } from "@/lib/debt-calculations";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { toMonthly } from "@/lib/format";
import {
  currentFinancialMonth,
  financialMonthRangeByMonth,
  offsetFinancialMonth,
  type FinancialMonthConfig,
} from "@/lib/date-range";
import {
  scoreFinancialHealth,
  type FinancialHealthResult,
  type HealthMetrics,
  type HealthStateKey,
  type HealthCategoryKey,
} from "@/lib/financial-health";

// ─── Measuring the Financial Health metrics from real Arca data ──────────────
//
// The only module that reads the database for the health score; the scoring rules
// themselves live in financial-health.ts and stay pure. Nothing here invents a
// value: every metric that can't be measured from what the user has actually
// recorded comes back as null, and the scorer normalizes it away.

/** How many completed financial months the trailing metrics look back over. */
export const HEALTH_WINDOW_MONTHS = 6;

/** Income stability needs a real series before a variation figure means anything. */
const MIN_MONTHS_FOR_STABILITY = 3;

/** Asset account types that count as "liquid" for emergency-fund cover. Investments
 * (beleggingen) and possessions (bezitting) are deliberately excluded — they aren't
 * money you can reach this week. */
const LIQUID_VERMOGEN_TYPES = ["spaarrekening", "betaalrekening"];

/** Recurring item types that are commitments going out. Mirrors the Forecast page's
 * EXPENSE_TYPES; "income" recurring items are the counterpart and never counted here. */
const RECURRING_EXPENSE_TYPES = ["bill", "subscription", "debt"];

/** Category budget types that make up "variable spending" — the spend an overall
 * budget is measured against (same set as budget-overview.ts). */
const VARIABLE_BUDGET_TYPES = ["nodig", "willen", "sparen"];

export interface MonthTotals {
  month: string; // YYYY-MM (financial month)
  income: number;
  expenses: number;
  /** Variable-category spend only — what the overall budget is compared against. */
  variableSpend: number;
}

export interface FinancialHealthSnapshotInput {
  score: number | null;
  netWorth: number | null;
  savingsRate: number | null;
}

export interface FinancialHealth extends FinancialHealthResult {
  metrics: HealthMetrics;
  /** Per-month totals behind the trailing metrics, oldest first. */
  monthTotals: MonthTotals[];
}

// ─── Window helpers ──────────────────────────────────────────────────────────

/**
 * The completed financial months the metrics are measured over, oldest first.
 * The current month is excluded: it is always partial, and a half-finished month
 * would drag the savings rate and income stability around for no real reason.
 */
function windowMonths(financialMonth: FinancialMonthConfig): string[] {
  const current = currentFinancialMonth(financialMonth);
  const list: string[] = [];
  for (let offset = HEALTH_WINDOW_MONTHS; offset >= 1; offset--) {
    list.push(offsetFinancialMonth(current, -offset));
  }
  return list;
}

/** Population coefficient of variation (σ ÷ mean). Null when it isn't defined. */
function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean <= 0) return null;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

// ─── Per-month income / expense totals ───────────────────────────────────────

/**
 * Split-aware income and expense totals per financial month over the window.
 *
 * Follows the same conventions as the rest of Arca's reporting so the numbers here
 * agree with the Overview and Trends tabs:
 *   • internal transfers between your own accounts are not income or spending;
 *   • reimbursements received (Tikkie) are not income;
 *   • transfers into savings categories are not spending — they're the savings the
 *     savings rate is trying to measure (same rule as getMonthComparison).
 */
async function getMonthTotals(months: string[], financialMonth: FinancialMonthConfig): Promise<MonthTotals[]> {
  if (months.length === 0) return [];

  const ranges = months.map((month) => ({ month, ...financialMonthRangeByMonth(month, financialMonth) }));
  const from = ranges[0].from;
  const to = ranges[ranges.length - 1].to;

  const [rows, variableCats] = await Promise.all([
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        direction: transactions.direction,
        amount: transactions.amount,
        correctedAmount: transactions.correctedAmount,
        categoryId: transactions.categoryId,
        categoryGroup: categories.group,
        isReimbursement: transactions.isReimbursement,
        isInternalTransfer: isInternalTransferExpr,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(gte(transactions.date, from), lte(transactions.date, to))),
    db
      .select({ id: categories.id })
      .from(categories)
      .where(inArray(categories.budgetType, VARIABLE_BUDGET_TYPES)),
  ]);

  const variableIds = new Set(variableCats.map((c) => c.id));
  const splitMap = groupTransactionSplits(await getTransactionSplitRows(rows.map((r) => r.id)));
  const allocations = buildSplitAllocations(rows, splitMap);

  const totals = new Map<string, MonthTotals>(
    ranges.map((r) => [r.month, { month: r.month, income: 0, expenses: 0, variableSpend: 0 }]),
  );

  for (const row of allocations) {
    if (row.isInternalTransfer || row.isReimbursement) continue;
    const range = ranges.find((r) => row.date >= r.from && row.date <= r.to);
    if (!range) continue;
    const bucket = totals.get(range.month)!;

    if (row.direction === "income") {
      bucket.income += row.amount;
    } else if (row.direction === "expense") {
      // Money moved into a savings category is saving, not spending.
      if (row.categoryGroup !== "savings") bucket.expenses += row.amount;
      if (row.categoryId != null && variableIds.has(row.categoryId)) bucket.variableSpend += row.amount;
    }
  }

  return ranges.map((r) => totals.get(r.month)!);
}

// ─── Liquid savings ──────────────────────────────────────────────────────────

/**
 * Money reachable in an emergency: manually-tracked savings/current asset accounts
 * plus any linked bank account flagged as a savings account. Returns null when the
 * user has no such account at all — an unmeasurable metric, not a zero balance, so
 * the emergency-fund category drops out of the score instead of scoring nothing.
 */
async function getLiquidSavings(): Promise<number | null> {
  const [assetAccounts, bankAccounts] = await Promise.all([
    db
      .select({ value: vermogenAccounts.value })
      .from(vermogenAccounts)
      .where(and(eq(vermogenAccounts.active, true), inArray(vermogenAccounts.type, LIQUID_VERMOGEN_TYPES))),
    getBankBalances(),
  ]);

  const savingsBanks = bankAccounts.filter((b) => b.cardType === "savings" || b.transferKind === "savings");
  if (assetAccounts.length === 0 && savingsBanks.length === 0) return null;

  const assetTotal = assetAccounts.reduce((s, a) => s + a.value, 0);
  // A negative (overdrawn) account can't contribute negative emergency cover.
  const bankTotal = savingsBanks.reduce((s, b) => s + Math.max(0, Number(b.balance) || 0), 0);
  return Math.max(0, assetTotal + bankTotal);
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

/**
 * Measures every health metric. Each one is independently guarded: a metric with
 * too little data behind it returns null rather than a misleading number.
 */
export async function getHealthMetrics(financialMonth: FinancialMonthConfig): Promise<{
  metrics: HealthMetrics;
  monthTotals: MonthTotals[];
}> {
  const months = windowMonths(financialMonth);

  const [monthTotals, liquidSavings, budgetRows, recurring, debtSummary] = await Promise.all([
    getMonthTotals(months, financialMonth),
    getLiquidSavings(),
    // Same "first active row wins" rule as getBudgetOverview, so the Health tab is
    // always measuring against the budget the Budget portal shows.
    db.select().from(budgets).where(eq(budgets.active, true)).orderBy(asc(budgets.id)).limit(1),
    db
      .select({ type: recurringItems.type, amount: recurringItems.amount, frequency: recurringItems.frequency })
      .from(recurringItems)
      .where(and(eq(recurringItems.active, true), inArray(recurringItems.type, RECURRING_EXPENSE_TYPES))),
    getDebtSummary(),
  ]);

  // Only months that actually recorded something count — a stretch of empty months
  // before the user's first import would otherwise drag every average towards zero.
  const activeMonths = monthTotals.filter((m) => m.income > 0 || m.expenses > 0);
  const monthsCovered = activeMonths.length;

  const totalIncome = activeMonths.reduce((s, m) => s + m.income, 0);
  const totalExpenses = activeMonths.reduce((s, m) => s + m.expenses, 0);
  const avgIncome = monthsCovered > 0 ? totalIncome / monthsCovered : 0;
  const avgExpenses = monthsCovered > 0 ? totalExpenses / monthsCovered : 0;

  // ── Savings rate — aggregated across the window rather than a mean of monthly
  // ratios, so one unusually small pay month can't dominate the figure.
  const savingsRate = totalIncome > 0 ? (totalIncome - totalExpenses) / totalIncome : null;

  // ── Emergency fund — months of expenses the liquid savings cover.
  const emergencyFundMonths = liquidSavings !== null && avgExpenses > 0 ? liquidSavings / avgExpenses : null;

  // ── Budget adherence — needs an overall budget to measure against. Each month
  // scores 1 when spending landed within the limit and falls linearly to 0 at
  // double the limit; the metric is the mean across the months with spending.
  const budgetRow = budgetRows[0];
  const monthlyLimit = budgetRow
    ? budgetRow.period === "weekly"
      ? budgetRow.amount * (52 / 12)
      : budgetRow.amount
    : null;
  const budgetMonths = monthTotals.filter((m) => m.variableSpend > 0);
  const budgetAdherence =
    monthlyLimit && monthlyLimit > 0 && budgetMonths.length > 0
      ? budgetMonths.reduce((s, m) => s + Math.max(0, 1 - Math.max(0, m.variableSpend - monthlyLimit) / monthlyLimit), 0) /
        budgetMonths.length
      : null;

  // ── Recurring commitments as a share of income.
  const recurringMonthly = recurring.reduce((s, item) => s + toMonthly(item.amount, item.frequency), 0);
  const recurringRatio = avgIncome > 0 && recurring.length > 0 ? recurringMonthly / avgIncome : null;

  // ── Debt payments as a share of income. Only debts you owe that still have a
  // balance left count; no debts at all is a real, measurable zero, not missing data.
  const monthlyDebtPayments = (debtSummary?.debts ?? [])
    .filter((d) => d.debt.direction !== "owed" && d.currentBalance > 0)
    .reduce((s, d) => s + d.debt.minimumPayment, 0);
  const debtRatio = avgIncome > 0 ? monthlyDebtPayments / avgIncome : null;

  // ── Income stability — how much monthly income moves around.
  const incomeSeries = activeMonths.map((m) => m.income).filter((v) => v > 0);
  const incomeVariation =
    incomeSeries.length >= MIN_MONTHS_FOR_STABILITY ? coefficientOfVariation(incomeSeries) : null;

  return {
    metrics: {
      savingsRate,
      emergencyFundMonths,
      budgetAdherence,
      recurringRatio,
      debtRatio,
      incomeVariation,
      monthsCovered,
    },
    monthTotals,
  };
}

/** The full health result — metrics, score, breakdown, opportunities and summary. */
export async function getFinancialHealth(financialMonth?: FinancialMonthConfig): Promise<FinancialHealth> {
  const config = financialMonth ?? (await getFinancialMonthConfig());
  const { metrics, monthTotals } = await getHealthMetrics(config);
  return { ...scoreFinancialHealth(metrics), metrics, monthTotals };
}

/** Just what the dashboard card renders — the score, its state, and the single
 * biggest improvement opportunity. */
export interface FinancialHealthSummary {
  score: number | null;
  stateKey: HealthStateKey | null;
  color: string | null;
  /** Highest-impact category to work on, or null at a perfect (or unscorable) score. */
  topOpportunity: HealthCategoryKey | null;
}

/**
 * Card-sized variant for the dashboard. Same computation as getFinancialHealth —
 * kept as its own entry point so the call site reads as intent, and so the card can
 * later be cached independently of the full page.
 */
export async function getFinancialHealthScore(
  financialMonth?: FinancialMonthConfig,
): Promise<FinancialHealthSummary> {
  const health = await getFinancialHealth(financialMonth);
  return {
    score: health.score,
    stateKey: health.state?.key ?? null,
    color: health.state?.color ?? null,
    topOpportunity: health.opportunities[0]?.key ?? null,
  };
}

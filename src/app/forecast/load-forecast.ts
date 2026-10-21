import { and, eq, gt, gte, isNotNull, lte, or } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db";
import {
  banks,
  budgetTargets,
  categories,
  goals as goalsTable,
  prognoseOverrides,
  recurringItems,
  savingsGoals,
  savingsMonthOverrides,
  transactions,
  variablePrognoseOverrides,
} from "@/db/schema";
import type { Category, Goal, RecurringItem, SavingsGoal } from "@/db/schema";
import { getBudgetStrategy, getFinancialMonthConfig } from "@/lib/app-settings";
import { resolveRecurringIcon } from "@/lib/auto-brand";
import { getCashFlowForecast, type CashFlowForecast } from "@/lib/cash-flow-forecast";
import { currentFinancialMonth, financialMonthRangeByMonth, offsetFinancialMonth, todayStr } from "@/lib/date-range";
import { formatEur, formatEurWhole, toMonthly } from "@/lib/format";
import { isInternalTransferExpr, effectiveTransferTypeExpr } from "@/lib/internal-transfers";
import { computeNetWorth } from "@/lib/net-worth-snapshots";
import type { TransactionDetail } from "@/app/transactions/transaction-types";
import { freeToSpend, getOverallMonthlyBudget, PLAN_EXPENSE_TYPES } from "@/lib/monthly-free-to-spend";
import { loadUnlinkedDebtMinimums } from "@/app/debts/load-debts";
import { amountFor } from "./plan-amounts";

// Everything the Forecast tab shows, loaded in one place. Two halves:
//  - the cash flow forecast: day by day from today, always 90 days ahead (the chart,
//    the numbers, the status and Coming up) — not driven by the plan month;
//  - the plan for one budget month (the plan card, the recurring items and their
//    one-month overrides, the 12-month projection) — driven by the month stepper.

export const EXPENSE_TYPES = PLAN_EXPENSE_TYPES;
export type ItemType = "income" | (typeof EXPENSE_TYPES)[number] | "savings" | "budget";

/** One budget month, named the way the Budget page names it: after the month it ends in. */
export interface PlanMonth {
  key: string; // YYYY-MM, the financial month key
  from: string;
  to: string;
  /** "November" */
  name: string;
  /** "November 2026" */
  long: string;
  /** "Nov" */
  short: string;
}

/** A row in Recurring items: a recurring item, a savings goal or a category budget. */
export interface PlanItem {
  key: string;
  /** Which override API a change goes to. */
  kind: "recurring" | "savings" | "budget";
  id: number;
  type: ItemType;
  name: string;
  meta: string;
  icon: string | null;
  color: string | null;
  background: string | null;
  /** The usual monthly amount (non-monthly items averaged per month). */
  defaultAmount: number;
  /** The usual amount differs per month: category budgets (month-specific targets), and
   *  recurrences with a start or end date (0 outside their period). */
  defaults?: Record<string, number>;
  /** Month key → the amount set for that month only. */
  overrides: Record<string, number>;
}

export interface ForecastData {
  today: string;
  cashFlow: CashFlowForecast;
  comingUp: {
    transactions: TransactionDetail[];
    categories: Category[];
    savingsGoals: Goal[];
    recurringItems: RecurringItem[];
  };
  month: string;
  /** The months the stepper and the override dialog can move between. */
  allowedMonths: string[];
  /** Labels for every month the plan, the stepper and the override strip can show. */
  months: Record<string, PlanMonth>;
  items: PlanItem[];
  plan: {
    income: number;
    incomeNames: string[];
    recurring: number;
    recurringNames: string[];
    savings: number;
    savingsNames: string[];
    budgets: number;
    budgetNames: string[];
    /** "overall": budgets is the overall budget; "categories": the sum of category budgets. */
    budgetSource: "overall" | "categories";
    /** Minimums of open debts that no recurring bill pays — a monthly cost too. */
    debts: number;
    free: number;
    days: number;
    needs: number;
    wants: number;
    savingsKind: number;
  };
  strategy: { nodig: number; willen: number; sparen: number };
  projection: { history: { date: string; netWorth: number }[]; forecast: { date: string; netWorth: number }[] } | null;
}

function maxKey(a: string, b: string) {
  return a > b ? a : b;
}
function minKey(a: string, b: string) {
  return a < b ? a : b;
}

function monthKeysBetween(from: string, to: string) {
  const keys: string[] = [];
  for (let k = from; k <= to; k = offsetFinancialMonth(k, 1)) keys.push(k);
  return keys;
}

export async function loadForecast(requestedMonth?: string): Promise<ForecastData> {
  const [financialMonth, strategy, locale, t] = await Promise.all([
    getFinancialMonthConfig(),
    getBudgetStrategy(),
    getLocale(),
    getTranslations("insights.forecast.items.meta"),
  ]);
  const dateLocale = locale === "nl" ? "nl-NL" : "en-GB";

  const baseMonth = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : currentFinancialMonth(financialMonth);

  // The stepper offers last month, this month and the next six (calendar-anchored, as
  // the month picker always was). The override strip shows three months either side,
  // and the 12-month projection runs from the plan month — fetch overrides for all of it.
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const allowedMonths = Array.from({ length: 8 }, (_, i) => offsetFinancialMonth(thisMonth, i - 1));
  const windowStart = offsetFinancialMonth(minKey(baseMonth, allowedMonths[0]), -3);
  const windowEnd = maxKey(offsetFinancialMonth(baseMonth, 11), offsetFinancialMonth(maxKey(baseMonth, allowedMonths[allowedMonths.length - 1]), 2));
  const windowKeys = monthKeysBetween(windowStart, windowEnd);

  const [itemsRaw, overridesRaw, savings, savingsOverridesRaw, allCategories, targets, variableOverridesRaw, netWorthData, cashFlow] = await Promise.all([
    // Not-yet-started items too (switched off until their start date): their months
    // ahead belong in the plan, and the ones before the start read 0 (see defaults below).
    db
      .select()
      .from(recurringItems)
      .where(or(eq(recurringItems.active, true), and(eq(recurringItems.dismissed, false), gt(recurringItems.startDate, todayStr()))))
      .orderBy(recurringItems.type, recurringItems.name),
    db.select().from(prognoseOverrides).where(and(gte(prognoseOverrides.month, windowStart), lte(prognoseOverrides.month, windowEnd))),
    db.select().from(savingsGoals).where(eq(savingsGoals.active, true)).orderBy(savingsGoals.name),
    db.select().from(savingsMonthOverrides).where(and(gte(savingsMonthOverrides.month, windowStart), lte(savingsMonthOverrides.month, windowEnd))),
    db.select().from(categories),
    db.select().from(budgetTargets).where(isNotNull(budgetTargets.categoryId)),
    db.select().from(variablePrognoseOverrides).where(and(gte(variablePrognoseOverrides.month, windowStart), lte(variablePrognoseOverrides.month, windowEnd))),
    computeNetWorth(),
    getCashFlowForecast(financialMonth),
  ]);

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

  // ── Month labels ────────────────────────────────────────────────────────────
  const fmtName = new Intl.DateTimeFormat(dateLocale, { month: "long" });
  const fmtLong = new Intl.DateTimeFormat(dateLocale, { month: "long", year: "numeric" });
  const fmtShort = new Intl.DateTimeFormat(dateLocale, { month: "short" });
  const months: Record<string, PlanMonth> = {};
  for (const key of windowKeys) {
    const range = financialMonthRangeByMonth(key, financialMonth);
    const end = new Date(`${range.to}T12:00:00`);
    months[key] = { key, from: range.from, to: range.to, name: fmtName.format(end), long: fmtLong.format(end), short: fmtShort.format(end).replace(/\.$/, "") };
  }

  // ── Overrides ───────────────────────────────────────────────────────────────
  const recurringOverrides = new Map<number, Record<string, number>>();
  for (const o of overridesRaw) {
    const rec = recurringOverrides.get(o.recurringItemId) ?? {};
    rec[o.month] = o.amount;
    recurringOverrides.set(o.recurringItemId, rec);
  }
  const savingsOverrides = new Map<number, Record<string, number>>();
  for (const o of savingsOverridesRaw) {
    const rec = savingsOverrides.get(o.goalId) ?? {};
    rec[o.month] = o.overrideAmount;
    savingsOverrides.set(o.goalId, rec);
  }
  const budgetOverrides = new Map<number, Record<string, number>>();
  for (const o of variableOverridesRaw) {
    const rec = budgetOverrides.get(o.categoryId) ?? {};
    rec[o.month] = o.overrideAmount;
    budgetOverrides.set(o.categoryId, rec);
  }

  const categoriesById = new Map(allCategories.map((c) => [c.id, c]));
  const fmtDate = new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short", year: "numeric" });
  const fmtMonthYear = new Intl.DateTimeFormat(dateLocale, { month: "short", year: "numeric" });

  // ── Recurring items ─────────────────────────────────────────────────────────
  function recurringMeta(item: RecurringItem) {
    const amount = item.amount != null ? formatEur(item.amount) : "—";
    switch (item.frequency) {
      case "monthly":
        return item.dueDay ? t("monthlyOn", { day: item.dueDay }) : t("monthly");
      case "four_weekly":
        return t("four_weekly", { amount });
      case "weekly":
        return t("weekly", { amount });
      case "quarterly":
        return t("quarterly", { amount });
      case "yearly":
        return t("yearly", { amount });
      case "daily":
        return t("daily", { amount });
      case "once":
        return item.startDate ? t("once", { date: fmtDate.format(new Date(`${item.startDate}T12:00:00`)) }) : t("onceNoDate");
      default:
        return t("monthly");
    }
  }

  const planItems: PlanItem[] = [];
  for (const item of itemsRaw) {
    if (item.type !== "income" && !(EXPENSE_TYPES as readonly string[]).includes(item.type)) continue;
    const icon = resolveRecurringIcon(item, categoriesById);
    const defaultAmount = toMonthly(item.amount, item.frequency);
    // A recurrence with a start or end date (a payment plan, a debt's bill) costs nothing
    // in the months outside that period, so those months read 0 instead of the usual amount.
    let defaults: Record<string, number> | undefined;
    if (item.startDate || item.endDate) {
      defaults = {};
      for (const key of windowKeys) {
        const range = financialMonthRangeByMonth(key, financialMonth);
        const inPeriod = (!item.startDate || range.to >= item.startDate) && (!item.endDate || range.from <= item.endDate);
        defaults[key] = inPeriod ? defaultAmount : 0;
      }
    }
    planItems.push({
      key: `rec-${item.id}`,
      kind: "recurring",
      id: item.id,
      type: item.type as ItemType,
      name: item.friendlyName ?? item.name,
      meta: recurringMeta(item),
      icon: icon.iconKey ?? null,
      color: icon.color,
      background: icon.background,
      defaultAmount,
      defaults,
      overrides: recurringOverrides.get(item.id) ?? {},
    });
  }

  // ── Savings goals ───────────────────────────────────────────────────────────
  function goalMeta(goal: SavingsGoal) {
    const current = formatEurWhole(goal.currentAmount);
    const target = formatEurWhole(goal.targetAmount);
    return goal.endDate
      ? t("goalBy", { current, target, date: fmtMonthYear.format(new Date(`${goal.endDate}T12:00:00`)) })
      : t("goal", { current, target });
  }
  for (const goal of savings) {
    planItems.push({
      key: `goal-${goal.id}`,
      kind: "savings",
      id: goal.id,
      type: "savings",
      name: goal.name,
      meta: goalMeta(goal),
      icon: goal.icon ?? "IconPigFilled",
      color: goal.color,
      background: null,
      defaultAmount: goal.monthlyContribution ?? 0,
      overrides: savingsOverrides.get(goal.id) ?? {},
    });
  }

  // ── Category budgets ────────────────────────────────────────────────────────
  // A category's usual amount for a month is its month-specific target, else its
  // default target (year 0, month 0). Only categories with a budget (or an override)
  // somewhere in the window are listed — the rest have nothing to plan.
  const defaultTarget = new Map<number, number>();
  const monthTarget = new Map<string, number>();
  for (const row of targets) {
    if (row.categoryId == null) continue;
    if (row.year === 0 && row.month === 0) defaultTarget.set(row.categoryId, row.targetAmount);
    else monthTarget.set(`${row.categoryId}:${row.year}-${String(row.month).padStart(2, "0")}`, row.targetAmount);
  }
  const budgetCats = allCategories
    .filter((c) => c.budgetType === "nodig" || c.budgetType === "willen" || c.budgetType === "sparen")
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const cat of budgetCats) {
    const defaults: Record<string, number> = {};
    for (const key of windowKeys) defaults[key] = monthTarget.get(`${cat.id}:${key}`) ?? defaultTarget.get(cat.id) ?? 0;
    const overrides = budgetOverrides.get(cat.id) ?? {};
    if (!Object.values(defaults).some((v) => v > 0) && Object.keys(overrides).length === 0) continue;
    const parent = cat.parentCategoryId != null ? categoriesById.get(cat.parentCategoryId) : undefined;
    planItems.push({
      key: `cat-${cat.id}`,
      kind: "budget",
      id: cat.id,
      type: "budget",
      name: cat.name,
      meta: parent ? t("subOf", { parent: parent.name }) : t("budget"),
      icon: cat.icon,
      color: cat.color,
      background: null,
      defaultAmount: defaultTarget.get(cat.id) ?? 0,
      defaults,
      overrides,
    });
  }

  // ── The plan for the chosen month ───────────────────────────────────────────
  const sum = (list: PlanItem[], month: string) => list.reduce((s, i) => s + amountFor(i, month), 0);
  // The same rule as the Debts page (lib/monthly-free-to-spend.ts): the overall budget
  // when one is set, else the category budgets; plus the debt minimums no bill pays.
  const [overallBudget, unlinkedDebts] = await Promise.all([getOverallMonthlyBudget(), loadUnlinkedDebtMinimums()]);
  const budgetFor = (list: PlanItem[], month: string) => overallBudget ?? sum(list, month);
  const byAmount = (list: PlanItem[]) => [...list].sort((a, b) => amountFor(b, baseMonth) - amountFor(a, baseMonth)).filter((i) => amountFor(i, baseMonth) > 0).map((i) => i.name);

  const incomeItems = planItems.filter((i) => i.type === "income");
  const costItems = planItems.filter((i) => (EXPENSE_TYPES as readonly string[]).includes(i.type));
  const goalItems = planItems.filter((i) => i.type === "savings");
  const budgetItems = planItems.filter((i) => i.type === "budget");

  const income = sum(incomeItems, baseMonth);
  const recurring = sum(costItems, baseMonth);
  const savingsTotal = sum(goalItems, baseMonth);
  const budgets = budgetFor(budgetItems, baseMonth);
  const free = freeToSpend({ income, recurring: recurring + unlinkedDebts, savings: savingsTotal, budget: budgets });

  // Needs / wants / savings against the budget strategy: recurring items by their own
  // budget type, category budgets by the category's, savings goals count as savings.
  const itemBudgetType = new Map(itemsRaw.map((i) => [i.id, i.budgetType]));
  const kindTotal = (kind: "nodig" | "willen" | "sparen") =>
    costItems.filter((i) => itemBudgetType.get(i.id) === kind).reduce((s, i) => s + amountFor(i, baseMonth), 0) +
    budgetItems.filter((i) => categoriesById.get(i.id)?.budgetType === kind).reduce((s, i) => s + amountFor(i, baseMonth), 0);

  const range = months[baseMonth];
  const days = Math.max(1, Math.round((new Date(`${range.to}T12:00:00`).getTime() - new Date(`${range.from}T12:00:00`).getTime()) / 86_400_000) + 1);

  // ── 12-month projection ─────────────────────────────────────────────────────
  // Net worth today (it already counts money owed to the user), carried forward month
  // by month with each month's plan (overrides included).
  let projection: ForecastData["projection"] = null;
  if (income > 0) {
    const anchor = netWorthData.netWorth;
    let running = 0;
    const forecast: { date: string; netWorth: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const m = offsetFinancialMonth(baseMonth, i);
      running += sum(incomeItems, m) - sum(costItems, m) - unlinkedDebts - sum(goalItems, m) - budgetFor(budgetItems, m);
      forecast.push({ date: `${offsetFinancialMonth(baseMonth, i + 1)}-01`, netWorth: Math.round(anchor + running) });
    }
    projection = { history: [{ date: `${baseMonth}-01`, netWorth: Math.round(anchor) }], forecast };
  }

  return {
    today: cashFlow.from,
    cashFlow,
    comingUp: {
      transactions: cashFlowTxRows as TransactionDetail[],
      categories: allCategories,
      savingsGoals: cashFlowSavingsGoals,
      recurringItems: itemsRaw,
    },
    month: baseMonth,
    allowedMonths,
    months,
    items: planItems,
    plan: {
      income,
      incomeNames: byAmount(incomeItems),
      recurring,
      recurringNames: byAmount(costItems),
      savings: savingsTotal,
      savingsNames: byAmount(goalItems),
      budgets,
      budgetNames: byAmount(budgetItems),
      budgetSource: overallBudget != null ? "overall" : "categories",
      debts: unlinkedDebts,
      free,
      days,
      needs: kindTotal("nodig"),
      wants: kindTotal("willen"),
      savingsKind: savingsTotal + kindTotal("sparen"),
    },
    strategy,
    projection,
  };
}

import type { BudgetRecurringMode } from "@/lib/app-settings";
import type { BudgetOverview } from "@/lib/budget-overview";
import { daysInclusive, shiftDate } from "@/lib/date-range";

export type SafeToSpendPace = "onPace" | "fast" | "over";

export interface SafeToSpend {
  /** The budget for this period (overall, or the sum of category budgets). */
  target: number;
  /** Spent so far against that budget. */
  spent: number;
  /** Bills still due this period that will count toward the budget once paid. */
  reserved: number;
  /** target − spent − reserved. Negative when over. */
  amount: number;
  /** What's left per day, today included; 0 when nothing is left. */
  perDay: number;
  /** The day the period resets (YYYY-MM-DD). */
  resetsOn: string;
  /** How far through the period today is, 0–1. */
  elapsed: number;
  /** What an even pace has spent by the end of today: the bills already paid plus the
   *  day-to-day budget (the budget minus this period's bills) spread evenly over the days. */
  even: number;
  /** Bills already paid this period, part of `spent`. */
  billsSpent: number;
  /** Days in the budget period. */
  totalDays: number;
  pace: SafeToSpendPace;
}

export interface UpcomingBill {
  categoryId: number | null;
  amount: number;
  /** YYYY-MM-DD */
  dueDate: string;
  isIncome: boolean;
}

/**
 * Safe to spend has one definition: the budget for this period, minus what is spent
 * against it, minus the bills still due that will count toward it once paid. A bill
 * counts when its category is a variable category inside the budget and the
 * budget-and-recurring mode lets recurring bills count there — the same rule
 * getBudgetOverview applies to spend — so paying it later moves the money from
 * "bills" to "spent" without changing the total. Null without a budget.
 */
export function safeToSpend(
  overview: Pick<BudgetOverview, "budget" | "allocated" | "totalSpent" | "budgetedSpent" | "from" | "to" | "categories"> &
    Partial<Pick<BudgetOverview, "billsSpent" | "budgetedBillsSpent">>,
  bills: readonly UpcomingBill[],
  recurringMode: BudgetRecurringMode,
  today: string,
): SafeToSpend | null {
  const hasOverall = (overview.budget?.amount ?? 0) > 0;
  const target = hasOverall ? overview.budget!.amount : overview.allocated;
  if (target <= 0) return null;
  const spent = hasOverall ? overview.totalSpent : overview.budgetedSpent;
  const billsSpent = (hasOverall ? overview.billsSpent : overview.budgetedBillsSpent) ?? 0;

  const reserved = bills
    .filter((b) => !b.isIncome && b.dueDate >= today && b.dueDate <= overview.to)
    .filter((b) => countsTowardBudget(b.categoryId, overview.categories, hasOverall, true, recurringMode))
    .reduce((s, b) => s + b.amount, 0);

  const amount = target - spent - reserved;
  const totalDays = Math.max(1, daysInclusive(overview.from, overview.to));
  const daysLeft = Math.max(1, daysInclusive(today < overview.from ? overview.from : today, overview.to));
  const elapsed = (totalDays - daysLeft) / totalDays;
  // The pace is about day-to-day spending: bills are taken as they come (paid ones as
  // paid, the rest reserved), and what is left of the budget is spread evenly over the
  // days, today included. Comparing spent + bills with the budget × elapsed instead put
  // every month on "Spending fast" on day one, the bills all being due early.
  const daysSoFar = today < overview.from ? 0 : daysInclusive(overview.from, today < overview.to ? today : overview.to);
  const dayToDayBudget = Math.max(0, target - billsSpent - reserved);
  const even = billsSpent + (dayToDayBudget * daysSoFar) / totalDays;

  return {
    target,
    spent,
    reserved,
    amount,
    perDay: Math.max(0, amount) / daysLeft,
    resetsOn: shiftDate(overview.to, 1),
    elapsed,
    even,
    billsSpent,
    totalDays,
    pace: amount < 0 ? "over" : spent - even > 0.05 * dayToDayBudget ? "fast" : "onPace",
  };
}

/**
 * Whether bills (transactions matched to a recurring item) count toward a budget, the
 * one rule the overview's spend, Safe to spend's bills still due and Home's pace line
 * share. "always" and "exclude" decide outright; "budgeted" counts them where a budget
 * covers them: everywhere under an overall budget (it is what may be spent in total),
 * else in a category with a budget of its own or on its group.
 */
export function recurringCountsToward(mode: BudgetRecurringMode, hasOverall: boolean, budgeted: boolean): boolean {
  return mode === "always" || (mode === "budgeted" && (hasOverall || budgeted));
}

type BudgetCategory = Pick<BudgetOverview["categories"][number], "categoryId" | "parentCategoryId" | "budget">;

/** Whether spending in a category (null: uncategorised) counts toward the budget. */
function countsTowardBudget(
  categoryId: number | null,
  categories: readonly BudgetCategory[],
  hasOverall: boolean,
  recurring: boolean,
  recurringMode: BudgetRecurringMode,
) {
  // Uncategorised spending is part of an overall budget, outside category budgets.
  const cat = categoryId == null ? null : categories.find((c) => c.categoryId === categoryId);
  if (cat === undefined) return false; // not a variable category: never part of the budget
  if (cat === null && !hasOverall) return false;
  const group = cat?.parentCategoryId != null ? categories.find((c) => c.categoryId === cat.parentCategoryId) : undefined;
  const budgeted = cat != null && (cat.budget != null || group?.budget != null);
  if (!hasOverall && !budgeted) return false; // outside the category budgets
  return !recurring || recurringCountsToward(recurringMode, hasOverall, budgeted);
}

export interface SpendEntry {
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  categoryId: number | null;
  /** Matched to a recurring bill or subscription. */
  recurring: boolean;
}

/**
 * Spend against the budget, cumulative per day from the start of the period up to and
 * including today (or the period's last day), for the hero's pace line. Uses the same
 * counting rules as safeToSpend's bills.
 */
export function budgetSpendByDay(
  entries: readonly SpendEntry[],
  overview: Pick<BudgetOverview, "budget" | "from" | "to" | "categories">,
  recurringMode: BudgetRecurringMode,
  today: string,
): number[] {
  const hasOverall = (overview.budget?.amount ?? 0) > 0;
  const last = today < overview.to ? today : overview.to;
  const days = daysInclusive(overview.from, last);
  const daily = new Array<number>(days).fill(0);

  for (const e of entries) {
    if (e.date < overview.from || e.date > last) continue;
    if (!countsTowardBudget(e.categoryId, overview.categories, hasOverall, e.recurring, recurringMode)) continue;
    daily[daysInclusive(overview.from, e.date) - 1] += e.amount;
  }

  let running = 0;
  return daily.map((d) => (running += d));
}

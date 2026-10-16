import { differenceInCalendarMonths } from "date-fns";
import type { Goal } from "@/db/schema";
import type { GoalsPageData } from "./load-goals";

export type GoalType = "expense" | "savings";

/** The swatches offered for a goal's colour; `key` names it (goals.colors.<key>). */
export const GOAL_COLORS = [
  { key: "blue", hex: "#3b82f6" },
  { key: "orange", hex: "#f97316" },
  { key: "purple", hex: "#a855f7" },
  { key: "pink", hex: "#ec4899" },
  { key: "teal", hex: "#14b8a6" },
  { key: "indigo", hex: "#6366f1" },
  { key: "amber", hex: "#f59e0b" },
  { key: "green", hex: "#22c55e" },
] as const;

export const RECURRENCES = ["none", "weekly", "monthly", "yearly"] as const;

/** A goal's colour, or the info blue when it has none. */
export function goalColor(goal: Pick<Goal, "color">): string {
  return goal.color ?? "var(--clr-info-fill)";
}

/** The pastel behind a goal's icon: its own colour at 16% on the card, as on Budget. */
export function goalIconBackground(color: string | null) {
  return color ? `color-mix(in srgb, ${color} 16%, transparent)` : "var(--clr-tile)";
}

// Months remaining between a start date (or today, if the start is in the past) and
// an end date — used to auto-compute the monthly contribution a savings goal needs.
export function monthsUntil(endDate: string, startDate?: string | null): number {
  const today = new Date().toISOString().slice(0, 10);
  const from = startDate && startDate > today ? startDate : today;
  return Math.max(1, differenceInCalendarMonths(new Date(`${endDate}T00:00:00`), new Date(`${from}T00:00:00`)));
}

// Progress as a 0–100 percentage of the goal's target. Expense goals track spending
// against a cap the same way savings goals track saved-up amount against a target.
export function goalProgressPct(goal: Pick<Goal, "currentAmount" | "targetAmount">): number {
  if (!goal.targetAmount || goal.targetAmount <= 0) return 0;
  return Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
}

/** Payments still needed at the planned monthly amount: 0 when reached, null without a monthly amount. */
export function monthsLeft(goal: Pick<Goal, "currentAmount" | "targetAmount" | "monthlyContribution">): number | null {
  const remaining = goal.targetAmount - goal.currentAmount;
  if (goal.targetAmount > 0 && remaining <= 0) return 0;
  const monthly = goal.monthlyContribution ?? 0;
  return monthly > 0 && remaining > 0 ? Math.ceil(remaining / monthly) : null;
}

/** The account the goal's latest contribution came from, or null when none is listed. */
export function linkedAccount(goal: Pick<Goal, "id">, recent: GoalsPageData["recent"]): string | null {
  return recent.find((c) => c.goalId === goal.id)?.account ?? null;
}

/** The first of the month `n` months from now. */
export function addMonths(n: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return d;
}

/** Balances after each month at the planned amount, until the target (at most 60 months). */
export function futureBalances(current: number, target: number, monthly: number): number[] {
  if (monthly <= 0 || target <= 0 || current >= target) return [];
  const months = Math.min(60, Math.ceil((target - current) / monthly));
  return Array.from({ length: months }, (_, i) => Math.min(target, current + monthly * (i + 1)));
}

/**
 * A goal's balance at the end of each of the past 12 months (from the contributions
 * linked to it), starting at the month it started; the last entry is today's balance.
 * `firstMonth` is the YYYY-MM the history starts at.
 */
export function goalHistory(goal: Goal, data: Pick<GoalsPageData, "byGoal" | "months">): { past: number[]; firstMonth: string | null } {
  const perMonth = data.byGoal[goal.id] ?? [];
  const balances = perMonth.map((_, i) => goal.currentAmount - perMonth.slice(i + 1).reduce((s, v) => s + v, 0));
  const started = goal.startDate ?? goal.createdAt?.slice(0, 10) ?? null;
  const found = started ? data.months.findIndex((m) => m.month >= started.slice(0, 7)) : 0;
  const start = found === -1 ? Math.max(0, data.months.length - 1) : found;
  const past = balances.length > 0 ? balances.slice(start) : [goal.currentAmount];
  return { past: past.length > 0 ? past : [goal.currentAmount], firstMonth: data.months[start]?.month ?? null };
}

import { differenceInCalendarMonths } from "date-fns";
import type { Goal } from "@/db/schema";

export type GoalType = "expense" | "savings";

export interface SavingsSummary {
  totalSaved: number;
  totalTargetSavings: number;
  totalReachedPct: number;
  totalMonthly: number;
  latestTargetLabel: string | null;
  totalCount: number;
}

export interface LeftThisMonth {
  totalTarget: number;
  totalSpentOnTargets: number;
  totalLeft: number;
  rawTotalPct: number;
  totalPct: number;
  totalOver: boolean;
}

export const GOAL_COLORS = ["#3b82f6", "#f97316", "#a855f7", "#ec4899", "#14b8a6", "#6366f1", "#f59e0b", "#22c55e"];

export const RECURRENCE_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "None" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export function recurrenceLabel(value: string | null | undefined): string {
  return RECURRENCE_OPTIONS.find((o) => o.value === value)?.label ?? "None";
}

export function goalTypeLabel(type: string): string {
  return type === "expense" ? "Budget" : "Savings";
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

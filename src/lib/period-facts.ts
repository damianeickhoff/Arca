// The figures behind Insights › Overview's summary card — pure, so they can be tested
// and shared: the card shows them as they are when AI is off, and Gemini gets exactly
// these when it is on ("AI explains, the app computes").

import { roundToCents } from "@/lib/transaction-splits";

/** Above this share of the total, "Other" gets its own callout. */
export const OTHER_CALLOUT_SHARE = 0.3;

/** The average per day over `days` days (at least one), in cents. */
export function averagePerDay(total: number, days: number): number {
  return roundToCents(total / Math.max(1, days));
}

/**
 * The rows of a breakdown sorted by amount, and what is left of `total` once they are
 * counted: "Other" (uncategorised spending, categories hidden from spending rows).
 */
export function withOther<T extends { spent: number }>(rows: T[], total: number): { rows: T[]; other: number; otherShare: number } {
  const sorted = [...rows].filter((r) => r.spent > 0).sort((a, b) => b.spent - a.spent);
  const counted = sorted.reduce((s, r) => s + r.spent, 0);
  const other = roundToCents(Math.max(0, total - counted));
  return { rows: sorted, other, otherShare: total > 0 ? other / total : 0 };
}

/** Whether Other is big enough to point at Needs review. */
export function showOtherCallout(otherShare: number, uncategorised: number): boolean {
  return otherShare > OTHER_CALLOUT_SHARE && uncategorised > 0;
}

/** Spending against income: ahead of it, within it, or no income at all yet. */
export type Balance = { kind: "ahead" | "kept"; amount: number } | { kind: "noIncome"; amount: number };

export function balanceOf(income: number, expense: number): Balance {
  if (income <= 0) return { kind: "noIncome", amount: roundToCents(expense) };
  const diff = roundToCents(income - expense);
  return diff < 0 ? { kind: "ahead", amount: -diff } : { kind: "kept", amount: diff };
}

/** The figures the Insights overview already shows, as the summary's only input. */
export interface SummaryFacts {
  from: string;
  to: string;
  ongoing: boolean;
  income: number;
  expense: number;
  saved: number;
  /** Whole-percent change against the previous period of the same length, signed. */
  incomeChangePct: number | null;
  expenseChangePct: number | null;
  avgPerDay: number;
  /** Last period's spending per day; null when it had none. */
  prevAvgPerDay: number | null;
  /** Safe to spend for the rest of the budget period after the bills still due; null
   *  when the period is over or there is no budget. */
  left: { amount: number; perDay: number; daysLeft: number } | null;
  biggestGroup: { name: string; spent: number } | null;
  topMerchant: { name: string; total: number; visits: number } | null;
  /** Spending outside every group, with the uncategorised transactions in it. */
  other: { amount: number; sharePct: number; transactions: number };
  categories: { name: string; spent: number; budget: number | null }[];
  merchants: { name: string; total: number; visits: number }[];
  largest: { name: string | null; amount: number; category: string | null } | null;
}

export interface SummaryInput {
  from: string;
  to: string;
  ongoing: boolean;
  income: number;
  expense: number;
  incomeChangePct: number | null;
  expenseChangePct: number | null;
  /** Days of the period up to today. */
  daysElapsed: number;
  prevExpense: number;
  prevDays: number;
  left: { amount: number; perDay: number; daysLeft: number } | null;
  /** Spending per group, any order. */
  groups: { name: string; spent: number }[];
  categories: { name: string; spent: number; budget: number | null }[];
  /** Sorted, biggest first. */
  merchants: { name: string; total: number; visits: number }[];
  largest: { name: string | null; amount: number; category: string | null } | null;
  uncategorised: number;
}

/** Turns the overview's figures into the summary facts, every amount in cents. */
export function buildSummaryFacts(input: SummaryInput): SummaryFacts {
  const groups = withOther(input.groups, input.expense);
  const top = groups.rows[0];
  return {
    from: input.from,
    to: input.to,
    ongoing: input.ongoing,
    income: roundToCents(input.income),
    expense: roundToCents(input.expense),
    saved: roundToCents(input.income - input.expense),
    incomeChangePct: input.incomeChangePct,
    expenseChangePct: input.expenseChangePct,
    avgPerDay: averagePerDay(input.expense, input.daysElapsed),
    prevAvgPerDay: input.prevExpense > 0 ? averagePerDay(input.prevExpense, input.prevDays) : null,
    left: input.left ? { amount: roundToCents(input.left.amount), perDay: roundToCents(input.left.perDay), daysLeft: input.left.daysLeft } : null,
    biggestGroup: top ? { name: top.name, spent: roundToCents(top.spent) } : null,
    topMerchant: input.merchants[0] ? { ...input.merchants[0], total: roundToCents(input.merchants[0].total) } : null,
    other: { amount: groups.other, sharePct: Math.round(groups.otherShare * 100), transactions: input.uncategorised },
    categories: input.categories.slice(0, 8).map((c) => ({ ...c, spent: roundToCents(c.spent) })),
    merchants: input.merchants.slice(0, 6).map((m) => ({ ...m, total: roundToCents(m.total) })),
    largest: input.largest ? { ...input.largest, amount: roundToCents(input.largest.amount) } : null,
  };
}

/** Gemini's structured summary, as kept in app_settings. */
export interface PeriodSummary {
  headline: string;
  /** Three short facts, each with figures from the input. */
  facts: string[];
  /** Budgeting advice based on what is left to spend. */
  tip: string;
  /** ISO timestamp. */
  createdAt: string;
}

/** Checks a model answer (or a kept entry) and returns it as a summary, or null. */
export function toPeriodSummary(raw: unknown, createdAt: string): PeriodSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const headline = text(r.headline);
  const tip = text(r.tip);
  const facts = (Array.isArray(r.facts) ? r.facts : []).map(text).filter(Boolean).slice(0, 3);
  if (!headline || !tip || facts.length === 0) return null;
  return { headline, facts, tip, createdAt };
}

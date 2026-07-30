// ─── Financial Health scoring engine ─────────────────────────────────────────
//
// Pure, deterministic, and dependency-free: it takes an already-measured set of
// metrics (see financial-health-data.ts, which is the only place that touches the
// database) and turns them into a 0–100 score, a per-category breakdown, ranked
// improvement opportunities and a plain-language summary.
//
// Design rules:
//   • No I/O and no randomness — the same HealthMetrics always produce the same
//     result, which is what makes the monthly snapshots comparable over time.
//   • A metric that can't be measured is `null`, never 0. Null categories are
//     dropped from the total and the score is normalized over the categories that
//     COULD be measured, so a user is never punished for data Arca doesn't have.
//   • Adding a category is a matter of appending one entry to HEALTH_CATEGORIES —
//     the total, the normalization, the breakdown UI and the opportunity ranking
//     all derive from that list.
//
// Every threshold below is a documented constant rather than a magic number in a
// formula, so the scoring can be reasoned about (and tuned) without reading code.

// ─── Thresholds ──────────────────────────────────────────────────────────────
// Each pair is (no points, full points). Where the second number is lower than the
// first the metric is "lower is better" and the ramp runs downhill.

/** Net savings ÷ income. 0% earns nothing; 20% or more earns the full 20 points. */
export const SAVINGS_RATE_FLOOR = 0;
export const SAVINGS_RATE_TARGET = 0.2;

/** Liquid savings measured in months of expenses. 6 months is the full-marks target. */
export const EMERGENCY_FUND_FLOOR = 0;
export const EMERGENCY_FUND_TARGET = 6;

/** Recurring commitments ÷ income. At/below 35% is full marks, 75%+ scores nothing. */
export const RECURRING_RATIO_TARGET = 0.35;
export const RECURRING_RATIO_FLOOR = 0.75;

/** Monthly debt payments ÷ income. Debt-free is full marks, 40%+ scores nothing. */
export const DEBT_RATIO_TARGET = 0;
export const DEBT_RATIO_FLOOR = 0.4;

/** Coefficient of variation of monthly income. Under 5% is full marks, 40%+ scores nothing. */
export const INCOME_VARIATION_TARGET = 0.05;
export const INCOME_VARIATION_FLOOR = 0.4;

// ─── Metric input ────────────────────────────────────────────────────────────

/**
 * The measured inputs to the score. Every field is `null` when there wasn't enough
 * data to measure it honestly — see financial-health-data.ts for the exact
 * "enough data" rule per metric.
 */
export interface HealthMetrics {
  /** Net savings (income − expenses) ÷ income, aggregated over the scored window. */
  savingsRate: number | null;
  /** Liquid savings ÷ average monthly expenses, expressed in months of cover. */
  emergencyFundMonths: number | null;
  /** 0–1. Mean per-month budget adherence over the completed months that had a budget. */
  budgetAdherence: number | null;
  /** Recurring monthly commitments ÷ average monthly income. */
  recurringRatio: number | null;
  /** Monthly debt payments ÷ average monthly income. */
  debtRatio: number | null;
  /** Coefficient of variation (σ ÷ mean) of monthly income across the window. */
  incomeVariation: number | null;
  /** How many financial months the window actually covered — used in explanations. */
  monthsCovered: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Linear ramp from `atZero` (scores 0) to `atFull` (scores 1), clamped at both ends.
 * Handles "lower is better" metrics too — pass atZero > atFull and the ramp runs
 * downhill without any extra branching at the call site.
 */
function ramp(value: number, atZero: number, atFull: number): number {
  if (atZero === atFull) return value >= atFull ? 1 : 0;
  return clamp01((value - atZero) / (atFull - atZero));
}

function months(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} month${rounded === 1 ? "" : "s"}`;
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

// ─── Category definitions ────────────────────────────────────────────────────

export type HealthCategoryKey =
  | "savingsRate"
  | "emergencyFund"
  | "budgetAdherence"
  | "recurringExpenses"
  | "debtRatio"
  | "incomeStability";

export interface HealthCategoryDefinition {
  key: HealthCategoryKey;
  label: string;
  maxPoints: number;
  /** Raw metric → 0–1 of this category's points, or null when unmeasurable. */
  measure: (m: HealthMetrics) => number | null;
  /** Neutral, factual sentence about the user's own figure. Only called when measurable. */
  explain: (m: HealthMetrics) => string;
  /** Shown when the metric is null — says what Arca still needs, never blames the user. */
  missingHint: string;
  /** Improvement-opportunity headline. */
  action: string;
  /** Recommendation clause used by the summary when this is the weakest area. */
  recommendation: string;
}

/**
 * The scored categories, in display order. Max points sum to 100; the score is
 * normalized against whichever subset could actually be measured.
 */
export const HEALTH_CATEGORIES: readonly HealthCategoryDefinition[] = [
  {
    key: "savingsRate",
    label: "Savings Rate",
    maxPoints: 20,
    measure: (m) => (m.savingsRate === null ? null : ramp(m.savingsRate, SAVINGS_RATE_FLOOR, SAVINGS_RATE_TARGET)),
    explain: (m) =>
      m.savingsRate! >= 0
        ? `You keep about ${pct(m.savingsRate!)} of your income over the last ${months(m.monthsCovered)}.`
        : `Your spending exceeded your income by about ${pct(Math.abs(m.savingsRate!))} over the last ${months(m.monthsCovered)}.`,
    missingHint: "Needs at least one completed month with recorded income.",
    action: "Increase savings rate",
    recommendation: `Setting aside a little more each month — around ${pct(SAVINGS_RATE_TARGET)} of income earns full marks here — would lift this the fastest.`,
  },
  {
    key: "emergencyFund",
    label: "Emergency Fund",
    maxPoints: 20,
    measure: (m) =>
      m.emergencyFundMonths === null ? null : ramp(m.emergencyFundMonths, EMERGENCY_FUND_FLOOR, EMERGENCY_FUND_TARGET),
    explain: (m) => `Your savings currently cover approximately ${months(m.emergencyFundMonths!)} of expenses.`,
    missingHint: "Needs a savings or current account and some recorded spending.",
    action: "Increase emergency fund",
    recommendation: `Building towards ${EMERGENCY_FUND_TARGET} months of expenses in easy-to-reach savings would have the biggest impact on your resilience.`,
  },
  {
    key: "budgetAdherence",
    label: "Budget Adherence",
    maxPoints: 20,
    measure: (m) => m.budgetAdherence,
    // The metric is 1 − (average overspend as a fraction of the limit), floored at 0
    // per month — so 1 − adherence reads back as the average overspend, and understates
    // it slightly once a month has run more than 100% over.
    explain: (m) =>
      m.budgetAdherence! >= 0.99
        ? "You stayed within your budget in every month measured."
        : m.budgetAdherence! <= 0
          ? "Your spending ran well over your budget in the months measured."
          : `On average your spending ran about ${pct(1 - m.budgetAdherence!)} over your budget.`,
    missingHint: "Needs an overall budget and at least one completed month of spending.",
    action: "Stay closer to your budget",
    recommendation: "Tightening the categories that most often run over would move this the most.",
  },
  {
    key: "recurringExpenses",
    label: "Recurring Expenses",
    maxPoints: 15,
    measure: (m) => (m.recurringRatio === null ? null : ramp(m.recurringRatio, RECURRING_RATIO_FLOOR, RECURRING_RATIO_TARGET)),
    explain: (m) => `Recurring bills and subscriptions take about ${pct(m.recurringRatio!)} of your monthly income.`,
    missingHint: "Needs recorded income and at least one active recurring item.",
    action: "Reduce recurring expenses",
    recommendation: `Trimming fixed costs towards ${pct(RECURRING_RATIO_TARGET)} of income would free up the most room each month.`,
  },
  {
    key: "debtRatio",
    label: "Debt Ratio",
    maxPoints: 15,
    measure: (m) => (m.debtRatio === null ? null : ramp(m.debtRatio, DEBT_RATIO_FLOOR, DEBT_RATIO_TARGET)),
    explain: (m) =>
      m.debtRatio! <= 0
        ? "You have no monthly debt payments recorded."
        : `Debt payments take about ${pct(m.debtRatio!)} of your monthly income.`,
    missingHint: "Needs recorded income to compare debt payments against.",
    action: "Lower monthly debt payments",
    recommendation: "Paying down the debt with the highest monthly payment first would ease this quickest.",
  },
  {
    key: "incomeStability",
    label: "Income Stability",
    maxPoints: 10,
    measure: (m) =>
      m.incomeVariation === null ? null : ramp(m.incomeVariation, INCOME_VARIATION_FLOOR, INCOME_VARIATION_TARGET),
    explain: (m) =>
      m.incomeVariation! <= INCOME_VARIATION_TARGET
        ? "Your monthly income has been very consistent."
        : `Your monthly income varies by about ${pct(m.incomeVariation!)} month to month.`,
    missingHint: "Needs at least three completed months with recorded income.",
    action: "Even out monthly income",
    recommendation: "A steadier month-to-month income, or a buffer that smooths the quiet months, would help here.",
  },
] as const;

/** 100 by construction. Derived rather than hard-coded so adding a category can't
 * silently break the "out of 100" the UI promises. */
export const HEALTH_MAX_POINTS = HEALTH_CATEGORIES.reduce((sum, c) => sum + c.maxPoints, 0);

// ─── States ──────────────────────────────────────────────────────────────────

export type HealthStateKey = "excellent" | "good" | "fair" | "attention";

export interface HealthState {
  key: HealthStateKey;
  label: string;
  /** CSS custom property, matching the tokens the rest of Arca uses for status colour. */
  color: string;
  /** Lower bound of the band, inclusive. */
  min: number;
}

export const HEALTH_STATES: readonly HealthState[] = [
  { key: "excellent", label: "Excellent", color: "var(--color-success)", min: 90 },
  { key: "good", label: "Good", color: "var(--primary)", min: 75 },
  { key: "fair", label: "Fair", color: "var(--color-warning)", min: 50 },
  { key: "attention", label: "Needs Attention", color: "var(--color-danger)", min: 0 },
] as const;

export function healthState(score: number): HealthState {
  return HEALTH_STATES.find((s) => score >= s.min) ?? HEALTH_STATES[HEALTH_STATES.length - 1];
}

// ─── Result shape ────────────────────────────────────────────────────────────

export interface HealthCategoryResult {
  key: HealthCategoryKey;
  label: string;
  maxPoints: number;
  /** Whole points earned, or null when the category couldn't be measured. */
  points: number | null;
  /** points ÷ maxPoints, or null. Used for ranking strongest/weakest. */
  ratio: number | null;
  /** The user-facing sentence: the explanation, or the missing-data hint. */
  detail: string;
  available: boolean;
}

export interface HealthOpportunity {
  key: HealthCategoryKey;
  label: string;
  action: string;
  /** Points the OVERALL (normalized) score would gain by maxing this category out. */
  potential: number;
}

export interface FinancialHealthResult {
  /** 0–100, normalized over the measurable categories. Null when nothing is measurable. */
  score: number | null;
  state: HealthState | null;
  /** Points earned and points on offer, both restricted to measurable categories. */
  earned: number;
  available: number;
  categories: HealthCategoryResult[];
  opportunities: HealthOpportunity[];
  summary: string;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Turns measured metrics into the full result.
 *
 * Category points are rounded to whole numbers first, then summed — so the
 * breakdown the user reads always adds up to the totals shown next to it, rather
 * than differing by a rounding crumb.
 */
export function scoreFinancialHealth(metrics: HealthMetrics): FinancialHealthResult {
  const categories: HealthCategoryResult[] = HEALTH_CATEGORIES.map((def) => {
    const measured = def.measure(metrics);
    if (measured === null) {
      return {
        key: def.key,
        label: def.label,
        maxPoints: def.maxPoints,
        points: null,
        ratio: null,
        detail: def.missingHint,
        available: false,
      };
    }
    const points = Math.round(clamp01(measured) * def.maxPoints);
    return {
      key: def.key,
      label: def.label,
      maxPoints: def.maxPoints,
      points,
      ratio: points / def.maxPoints,
      detail: def.explain(metrics),
      available: true,
    };
  });

  const measurable = categories.filter((c) => c.available);
  const earned = measurable.reduce((sum, c) => sum + (c.points ?? 0), 0);
  const available = measurable.reduce((sum, c) => sum + c.maxPoints, 0);
  const score = available > 0 ? Math.round((earned / available) * 100) : null;

  // Ranked by how many points of the FINAL score each category is leaving on the
  // table, so the ordering reflects real impact rather than raw category size.
  const opportunities: HealthOpportunity[] = measurable
    .map((c) => {
      const def = HEALTH_CATEGORIES.find((d) => d.key === c.key)!;
      const gap = c.maxPoints - (c.points ?? 0);
      return {
        key: c.key,
        label: c.label,
        action: def.action,
        potential: available > 0 ? Math.round((gap / available) * 100) : 0,
      };
    })
    .filter((o) => o.potential > 0)
    .sort((a, b) => b.potential - a.potential || a.key.localeCompare(b.key))
    .slice(0, 3);

  return {
    score,
    state: score === null ? null : healthState(score),
    earned,
    available,
    categories,
    opportunities,
    summary: buildSummary(score, categories),
  };
}

// ─── Summary ─────────────────────────────────────────────────────────────────

const STATE_OPENINGS: Record<HealthStateKey, string> = {
  excellent: "Your finances are in excellent shape.",
  good: "Your finances are in good shape.",
  fair: "Your finances are on reasonably steady ground.",
  attention: "There are a few areas of your finances worth some attention.",
};

/**
 * A 2–4 sentence, deliberately non-judgmental read-out: where the user stands,
 * their strongest area, their weakest, and the single change that would move the
 * score most. Fully template-driven from the same numbers the breakdown shows, so
 * it can never contradict the rest of the page.
 */
function buildSummary(score: number | null, categories: HealthCategoryResult[]): string {
  const measurable = categories.filter((c) => c.available);
  if (score === null || measurable.length === 0) {
    return "There isn't enough data yet to measure your financial health. Adding accounts, a budget and a few weeks of transactions will fill this in.";
  }

  const opening = STATE_OPENINGS[healthState(score).key];
  const byRatio = [...measurable].sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
  const strongest = byRatio[0];
  const weakest = byRatio[byRatio.length - 1];

  // A single measurable category (or an all-square breakdown) has no meaningful
  // strongest-vs-weakest contrast, so the summary stays short rather than saying
  // the same thing twice.
  if (measurable.length === 1 || strongest.key === weakest.key) {
    return `${opening} ${strongest.detail}`;
  }

  const weakestDef = HEALTH_CATEGORIES.find((d) => d.key === weakest.key)!;
  const strongSentence = `${strongest.label} is your strongest area at ${strongest.points}/${strongest.maxPoints}.`;
  const weakSentence = `${weakest.label} has the most room to grow — ${weakest.detail.replace(/^./, (c) => c.toLowerCase())}`;

  return `${opening} ${strongSentence} ${weakSentence} ${weakestDef.recommendation}`;
}

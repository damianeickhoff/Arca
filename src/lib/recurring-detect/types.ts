// Shapes shared by the recurring detector's pure parts (grouping, rhythm, amount,
// scoring). Nothing here touches the database, so the whole detector can be tested
// on fixtures — see tests/lib/detect-recurring.test.ts.

/** One transaction as the detector sees it. */
export type DetectTransaction = {
  id: number;
  date: string; // YYYY-MM-DD
  amount: number; // either sign; the detector works on |amount|
  direction: string; // income | expense
  description: string;
  merchantId: number | null;
  merchantName?: string | null;
  counterAccount?: string | null;
};

/** The rhythms the detector recognises. "four_weekly" is every 28 days (a four-weekly
 *  salary), which drifts through the month, unlike "monthly". */
export type DetectedFrequency = "weekly" | "four_weekly" | "monthly" | "quarterly" | "yearly";

export type RecurringKind = "bill" | "subscription" | "income" | "debt";

/** A series that passed every test: what a suggestion is made of. */
export type RecurringCandidate = {
  /** Stable key for this counterparty, direction and amount band. A rejected
   *  suggestion keeps it, so the same series never comes back. */
  signature: string;
  name: string;
  type: RecurringKind;
  frequency: DetectedFrequency;
  /** Day of month it is due (monthly, quarterly, yearly); null for weekly rhythms. */
  dueDay: number | null;
  /** The first payment of the run: the anchor quarterly, yearly and weekly items count from. */
  startDate: string;
  /** The typical amount: the fixed amount, or the median of a variable one. */
  amount: number;
  /** Only for a variable amount: the lowest and highest seen. */
  amountMin: number | null;
  amountMax: number | null;
  /** What the accepted recurring item matches on (see lib/recurring-match.ts). */
  matchPattern: string;
  matchAmount: number | null;
  matchAmountMin: number | null;
  matchAmountMax: number | null;
  budgetType: string | null;
  merchantId: number | null;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  /** 0–1, see score.ts. */
  confidence: number;
  /** Matched the curated RECURRING_MERCHANTS list (name and type came from there). */
  curated: boolean;
  transactionIds: number[];
};

import { resolveDisplayName } from "@/lib/friendly-names";

// What Plan › Budget's "Needs a category" card shows: how many transactions still have
// no category, what they add up to, and the merchants most of them come from. Pure, so
// it runs on the rows getNeedsReviewTransactions() returns and in tests.

export interface NeedsReviewSummaryRow {
  amount: number;
  correctedAmount: number | null;
  description: string;
  customName: string | null;
  recurringFriendlyName: string | null;
  merchantId: number | null;
  merchantName: string | null;
}

export interface NeedsReviewSummary {
  count: number;
  total: number;
  /** The biggest groups first: a merchant, or the display name when there is none. */
  top: { name: string; count: number }[];
  /** How many other merchants are waiting beyond `top`. */
  otherMerchants: number;
}

export function summarizeNeedsReview(rows: readonly NeedsReviewSummaryRow[], topCount = 3): NeedsReviewSummary {
  const groups = new Map<string, { name: string; count: number }>();
  for (const r of rows) {
    const name = r.merchantName ?? resolveDisplayName(r);
    const key = r.merchantId != null ? `m${r.merchantId}` : `n${name.toLowerCase()}`;
    const g = groups.get(key) ?? { name, count: 0 };
    g.count += 1;
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, z) => z.count - a.count || a.name.localeCompare(z.name));
  return {
    count: rows.length,
    total: Math.round(rows.reduce((s, r) => s + Math.abs(r.correctedAmount ?? r.amount), 0) * 100) / 100,
    top: sorted.slice(0, topCount),
    otherMerchants: Math.max(0, sorted.length - topCount),
  };
}

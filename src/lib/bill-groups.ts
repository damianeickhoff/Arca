// Pure grouping and status helpers for the bill lists on Plan › Budget and
// Activity › Upcoming. No database access, so client components and tests share them.

/** The status control a bill row shows on the right:
 *  - "auto": Arca has a match pattern and ticks it off (or already did) — a stone chip
 *  - "pay":  it has a pattern, it is due or overdue and no payment matched — the black Paid pill
 *  - "ask":  there is no pattern, so Arca can't know — the "Paid?" pill with its popover
 *  - "paid": marked paid by hand — a mint pill that undoes the mark */
export type BillControl = "auto" | "pay" | "ask" | "paid";

export function billControl(
  b: { paid: boolean; paidSource: "match" | "manual" | null; hasPattern: boolean; dueDate: string | null },
  today: string,
): BillControl {
  if (b.paidSource === "manual") return "paid";
  if (b.paid) return "auto";
  if (!b.hasPattern) return "ask";
  return b.dueDate != null && b.dueDate <= today ? "pay" : "auto";
}

export interface GroupableBill {
  name: string;
  amount: number | null;
  dueDate: string | null;
  paid: boolean;
  overdue: boolean;
  isIncome: boolean;
}

/** Soonest first; a bill without a due day goes last, then by name. */
export function byDueDate<T extends { dueDate: string | null; name: string }>(a: T, z: T) {
  return (a.dueDate ?? "9999").localeCompare(z.dueDate ?? "9999") || a.name.localeCompare(z.name);
}

/** What a list of bills costs: expenses only, income never counts towards it. */
export function billsTotal(bills: readonly { amount: number | null; isIncome?: boolean }[]) {
  return bills.reduce((s, b) => (b.isIncome ? s : s + (b.amount ?? 0)), 0);
}

/**
 * The Budget card's bills (income left out): overdue first, then what is still to
 * come by due date (one without a due day at the end), then everything paid.
 */
export function groupBudgetBills<T extends GroupableBill>(bills: readonly T[]) {
  const out = bills.filter((b) => !b.isIncome).sort(byDueDate);
  return {
    overdue: out.filter((b) => !b.paid && b.overdue),
    comingUp: out.filter((b) => !b.paid && !b.overdue),
    paid: out.filter((b) => b.paid),
  };
}

/** The folded "9 paid · €1.240 · Rent, Energy, Spotify and 6 more" row. */
export function foldSummary(bills: readonly { name: string; amount: number | null; isIncome?: boolean }[], shown = 3) {
  const out = bills.filter((b) => !b.isIncome);
  // A weekly bill paid twice is named once; "and N more" counts the bills left over.
  const names = [...new Set(out.map((b) => b.name))].slice(0, shown);
  return {
    count: out.length,
    total: billsTotal(out),
    names,
    more: out.filter((b) => !names.includes(b.name)).length,
  };
}

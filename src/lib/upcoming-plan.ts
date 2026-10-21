import { shiftDate } from "@/lib/date-range";
import { billsTotal, byDueDate } from "@/lib/bill-groups";

// The sums behind Activity › Upcoming, kept pure so the page and the tests share them:
// the grouped bills list, what still leaves the account before payday, the running
// balance through the month and next month's preview.

export interface PlanBill {
  id: number;
  name: string;
  amount: number | null;
  /** YYYY-MM-DD; null for a bill without a due day ("This month"). */
  dueDate: string | null;
  paid: boolean;
  overdue: boolean;
  isIncome: boolean;
  /** "Skip October": out of every total this month. */
  skipped: boolean;
}

/** Still to come: not paid (or received) and not skipped. */
export const isOpen = (b: PlanBill) => !b.paid && !b.skipped;

export type GroupKey = "overdue" | "thisWeek" | "later" | "notPaid" | "comingUp";

/** The Sunday that ends `date`'s week (Monday to Sunday). */
export function weekEnd(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return shiftDate(date, (7 - day) % 7);
}

/**
 * One list for the month. The month in progress: Overdue, This week (to Sunday), Later
 * this month (a bill without a due day at its end). An ended month: Not paid. A month
 * still to come: Coming up. Income sits in the groups on its day; every group's total
 * counts expenses only. Paid, received and skipped items go to `done` (the folded row).
 */
export function groupUpcomingBills<T extends PlanBill>(bills: readonly T[], today: string, from: string, to: string) {
  const open = bills.filter(isOpen).sort(byDueDate);
  const done = bills.filter((b) => !isOpen(b)).sort(byDueDate);
  const make = (key: GroupKey, items: T[]) => ({ key, items, total: billsTotal(items) });
  let groups: { key: GroupKey; items: T[]; total: number }[];
  if (today > to) groups = [make("notPaid", open)];
  else if (today < from) groups = [make("comingUp", open)];
  else {
    const end = weekEnd(today);
    const overdue = open.filter((b) => b.overdue);
    const thisWeek = open.filter((b) => !b.overdue && b.dueDate != null && b.dueDate <= end);
    const later = open.filter((b) => !b.overdue && (b.dueDate == null || b.dueDate > end));
    groups = [make("overdue", overdue), make("thisWeek", thisWeek), make("later", later)];
  }
  return { groups: groups.filter((g) => g.items.length > 0), done };
}

/**
 * What still has to leave the account before payday: every open bill due up to the day
 * before the next income — overdue ones and any without a due day included — or up to
 * the end of the month when no income is expected.
 */
export function beforePayday(bills: readonly PlanBill[], to: string, nextIncomeDate: string | null) {
  const until = nextIncomeDate ? shiftDate(nextIncomeDate, -1) : to;
  const items = bills.filter((b) => isOpen(b) && !b.isIncome && (b.dueDate == null || b.dueDate <= until));
  return { amount: billsTotal(items), count: items.length, until };
}

export interface BalancePoint {
  date: string;
  balance: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * The checking balance through the month. `past`: each day's closing balance from the
 * first of the month to today, worked back from the balance now and the money that moved
 * since (`flows`, net per day, must run through today). `future`: from today, a step for
 * every bill and income still to come — overdue ones and any without a due day land
 * today — and nothing else, so day-to-day spending comes on top. `lowest` is the lowest
 * closing balance still ahead (null unless it is below today's); `end` the balance the
 * month ends on.
 */
export function runningBalance({
  from,
  to,
  today,
  balanceNow,
  flows,
  bills,
}: {
  from: string;
  to: string;
  today: string;
  balanceNow: number;
  flows: ReadonlyMap<string, number>;
  bills: readonly PlanBill[];
}) {
  const past: BalancePoint[] = [];
  const through = today < to ? today : to;
  if (from <= through) {
    // The balance at the close of `through`: now, minus what moved after it.
    let balance = balanceNow;
    for (const [date, net] of flows) if (date > through && date <= today) balance -= net;
    const days: string[] = [];
    for (let d = through; d >= from; d = shiftDate(d, -1)) days.push(d);
    for (const d of days) {
      past.unshift({ date: d, balance: cents(balance) });
      balance -= flows.get(d) ?? 0;
    }
  }

  const future: BalancePoint[] = [];
  let lowest: BalancePoint | null = null;
  if (today >= from && today <= to) {
    const byDay = new Map<string, number>();
    for (const b of bills) {
      if (!isOpen(b) || b.amount == null) continue;
      const day = b.dueDate == null || b.dueDate < today ? today : b.dueDate;
      byDay.set(day, (byDay.get(day) ?? 0) + (b.isIncome ? b.amount : -b.amount));
    }
    let balance = balanceNow;
    for (let d = today; d <= to; d = shiftDate(d, 1)) {
      balance += byDay.get(d) ?? 0;
      const point = { date: d, balance: cents(balance) };
      future.push(point);
      if (byDay.has(d) && (lowest == null || point.balance < lowest.balance)) lowest = point;
    }
  }

  // Only worth naming when the bills take the balance below where it is now.
  if (lowest && lowest.balance >= balanceNow) lowest = null;
  const end = future.at(-1)?.balance ?? past.at(-1)?.balance ?? balanceNow;
  return { past, future, lowest, end };
}

/** The dot a bill gets on the month grid: bigger for bigger amounts. */
export function dotSize(amount: number | null) {
  const a = amount ?? 0;
  return a >= 500 ? 9 : a >= 50 ? 7 : 5;
}

/** The day with the most going out (skipped bills left out); null when nothing does. */
export function busiestDay(bills: readonly PlanBill[]) {
  const byDay = new Map<string, number>();
  for (const b of bills) {
    if (b.isIncome || b.skipped || b.dueDate == null) continue;
    byDay.set(b.dueDate, (byDay.get(b.dueDate) ?? 0) + (b.amount ?? 0));
  }
  let best: { date: string; total: number } | null = null;
  for (const [date, total] of byDay) if (total > 0 && (best == null || total > best.total)) best = { date, total };
  return best;
}

export interface PreviewItem {
  id: number;
  name: string;
  amount: number | null;
  dueDate: string | null;
  isIncome: boolean;
  /** A payment plan's part on this date, and how many parts it has. */
  part: number | null;
  parts: number | null;
  /** Only for this month's items: when it comes back after next month (null when it doesn't). */
  nextDate?: string | null;
}

export type PreviewRow<T> = { kind: "new" | "same" | "skips"; item: T };

/**
 * Next month before it starts: what is new (a bill that isn't due this month, or a
 * payment plan's first part), what drops out (a quarterly bill that skips it), then the
 * biggest of the rest, `limit` rows in all, by date with the dropped ones last.
 */
export function previewNextMonth<T extends PreviewItem>(current: readonly T[], next: readonly T[], limit = 6) {
  const nextOut = next.filter((b) => !b.isIncome);
  const currentIds = new Set(current.map((b) => b.id));
  const nextIds = new Set(next.map((b) => b.id));
  const isNew = (b: T) => b.part === 1 || !currentIds.has(b.id);

  const fresh = nextOut.filter(isNew).sort(byDueDate);
  const seen = new Set<number>();
  const drops = current.filter((b) => {
    if (b.isIncome || nextIds.has(b.id) || seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });
  const rest = nextOut.filter((b) => !isNew(b)).sort((a, z) => (z.amount ?? 0) - (a.amount ?? 0));

  const picked = fresh.slice(0, limit);
  const dropped = drops.slice(0, Math.max(0, limit - picked.length));
  picked.push(...rest.slice(0, Math.max(0, limit - picked.length - dropped.length)));

  const rows: PreviewRow<T>[] = [
    ...picked.sort(byDueDate).map((item) => ({ kind: isNew(item) ? ("new" as const) : ("same" as const), item })),
    ...dropped.map((item) => ({ kind: "skips" as const, item })),
  ];
  const billsNext = billsTotal(nextOut);
  return {
    rows,
    more: nextOut.length - picked.length,
    bills: billsNext,
    billCount: nextOut.length,
    income: next.filter((b) => b.isIncome).reduce((s, b) => s + (b.amount ?? 0), 0),
    diff: billsNext - billsTotal(current),
  };
}

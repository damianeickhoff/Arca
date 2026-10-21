import { getLocale } from "next-intl/server";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { currentFinancialMonth, financialMonthRangeByMonth, offsetFinancialMonth, todayStr } from "@/lib/date-range";
import { getBillStatuses, UPCOMING_TYPES, type BillStatus } from "@/lib/bill-status";
import { getCheckingBalance } from "@/lib/account-balances";
import { planPartNumber } from "@/lib/payment-plan";
import { nextOccurrence } from "@/lib/recurring-occurrence";
import { byDueDate } from "@/lib/bill-groups";
import { beforePayday, previewNextMonth, runningBalance } from "@/lib/upcoming-plan";
import { listMigrationReview, listPendingSuggestions } from "@/lib/recurring-suggestions";
import { UpcomingView, type UpcomingBill, type UpcomingData } from "./upcoming-view";

export const dynamic = "force-dynamic";

/** How far the month arrows reach, in financial months either side of now. */
const MONTHS_BACK = 24;
const MONTHS_AHEAD = 12;

/** Recurring types a month can be skipped for: money you move yourself, not a bill. */
const SKIPPABLE = new Set(["savings"]);

const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000);

function toBill(s: BillStatus): UpcomingBill {
  const { item } = s;
  const part = s.dueDate ? planPartNumber(item, s.dueDate) : null;
  return {
    id: item.id,
    name: item.friendlyName ?? item.name,
    amount: item.amount,
    icon: s.icon,
    iconColor: s.iconColor,
    iconBackground: s.iconBackground,
    dueDate: s.dueDate,
    type: item.type,
    frequency: item.frequency,
    paid: s.paid === true,
    paidSource: s.paidSource,
    hasPattern: !!item.matchPattern,
    // Only a bill without a pattern needs the item itself: "Teach Arca the pattern".
    item: item.matchPattern ? null : item,
    overdue: s.overdue,
    isIncome: item.type === "income",
    skipped: s.skipped,
    skippable: SKIPPABLE.has(item.type),
    part,
    parts: part != null ? item.planParts : null,
    endDate: item.endDate,
  };
}

/**
 * Activity › Upcoming: one financial month of bills, subscriptions, debt payments,
 * savings transfers and expected income — what still leaves the account before payday,
 * the running balance through the month, one grouped list, a month grid and a preview
 * of the next month. ?month=YYYY-MM steps to another month.
 */
export default async function UpcomingTransactionsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const financialMonth = await getFinancialMonthConfig();
  const current = currentFinancialMonth(financialMonth);
  const oldest = offsetFinancialMonth(current, -MONTHS_BACK);
  const newest = offsetFinancialMonth(current, MONTHS_AHEAD);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) && sp.month >= oldest && sp.month <= newest ? sp.month : current;
  const nextMonth = offsetFinancialMonth(month, 1);
  const { from, to } = financialMonthRangeByMonth(month, financialMonth);
  const next = financialMonthRangeByMonth(nextMonth, financialMonth);
  const today = todayStr();

  const [statuses, nextStatuses, checking, suggestions, migration, locale] = await Promise.all([
    getBillStatuses(month, financialMonth, UPCOMING_TYPES, { includeSkipped: true }),
    getBillStatuses(nextMonth, financialMonth, UPCOMING_TYPES),
    // The flows run through today, so an ended month's balance can be worked back too.
    from <= today ? getCheckingBalance(from, today) : Promise.resolve(null),
    listPendingSuggestions(),
    listMigrationReview(),
    getLocale(),
  ]);

  const bills = statuses.map(toBill).sort(byDueDate);
  const nextBills = nextStatuses.map(toBill).sort(byDueDate);
  const isCurrent = month === current;

  // ── The next income: this month's when one is still to come, else next month's first.
  const upcomingIncome = (list: UpcomingBill[]) =>
    list.find((b) => b.isIncome && !b.paid && !b.skipped && b.dueDate != null && b.dueDate >= today);
  const income = isCurrent ? (upcomingIncome(bills) ?? upcomingIncome(nextBills)) : undefined;
  const nextIncome = income
    ? { name: income.name, amount: income.amount, date: income.dueDate!, days: daysBetween(today, income.dueDate!) }
    : null;
  // Before payday means before this month's income; one that lands next month ends it at the month's end.
  const payday = beforePayday(bills, to, nextIncome && nextIncome.date <= to ? nextIncome.date : null);

  // ── The running balance: only for a month that has started.
  const balanceNow = checking?.balance ?? null;
  const series =
    checking && balanceNow != null ? runningBalance({ from, to, today, balanceNow, flows: checking.flows, bills }) : null;

  // ── Next month: what is new, what skips it (and when it comes back), the totals.
  const itemById = new Map(statuses.map((s) => [s.item.id, s.item]));
  const preview = previewNextMonth<UpcomingBill & { nextDate?: string | null }>(
    bills.filter((b) => !b.skipped).map((b) => ({ ...b, nextDate: nextOccurrence(itemById.get(b.id)!, next.to) })),
    nextBills,
  );

  // Named after the month the period ends in, like the Budget page: 25 Sep – 24 Oct is October.
  const monthName = (date: string) => new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(`${date}T12:00:00`));
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(`${to}T12:00:00`));
  const href = (m: string) => (m === current ? "/transactions/upcoming" : `/transactions/upcoming?month=${m}`);

  const data: UpcomingData = {
    month,
    nextMonth,
    monthName: monthName(to),
    nextMonthName: monthName(next.to),
    monthLabel,
    from,
    to,
    today,
    period: today > to ? "past" : today < from ? "future" : "current",
    nav: {
      prev: month > oldest ? href(offsetFinancialMonth(month, -1)) : null,
      next: month < newest ? href(nextMonth) : null,
      today: isCurrent ? null : "/transactions/upcoming",
    },
    bills,
    payday,
    nextIncome,
    account: checking ? { name: checking.name, count: checking.count, balance: balanceNow } : null,
    series,
    preview: {
      ...preview,
      rows: preview.rows.map((r) => ({
        kind: r.kind,
        id: r.item.id,
        name: r.item.name,
        amount: r.item.amount,
        icon: r.item.icon,
        iconColor: r.item.iconColor,
        iconBackground: r.item.iconBackground,
        dueDate: r.item.dueDate,
        frequency: r.item.frequency,
        part: r.item.part,
        parts: r.item.parts,
        nextDate: r.kind === "skips" ? (r.item.nextDate ?? null) : null,
      })),
      // What is left once next month's bills and income are through, from where this one ends.
      leftAfter: series && isCurrent ? series.end + preview.income - preview.bills : null,
    },
    suggestions,
    migration,
  };

  return <UpcomingView data={data} />;
}

import { getLocale, getTranslations } from "next-intl/server";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { currentFinancialMonth, financialMonthRangeByMonth, offsetFinancialMonth, todayStr } from "@/lib/date-range";
import { getBillStatuses, UPCOMING_TYPES } from "@/lib/bill-status";
import { planPartNumber } from "@/lib/payment-plan";
import { listMigrationReview, listPendingSuggestions } from "@/lib/recurring-suggestions";
import { UpcomingView, type UpcomingBill } from "./upcoming-view";

export const dynamic = "force-dynamic";

/** How far the month arrows reach, in financial months either side of now. */
const MONTHS_BACK = 24;
const MONTHS_AHEAD = 12;

/**
 * Activity › Upcoming: one financial month of bills, subscriptions, debt payments,
 * savings transfers and expected income — what is still due, what is paid and what is
 * coming in — with a calendar of the month. ?month=YYYY-MM steps to another month.
 */
export default async function UpcomingTransactionsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const financialMonth = await getFinancialMonthConfig();
  const current = currentFinancialMonth(financialMonth);
  const oldest = offsetFinancialMonth(current, -MONTHS_BACK);
  const newest = offsetFinancialMonth(current, MONTHS_AHEAD);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) && sp.month >= oldest && sp.month <= newest ? sp.month : current;
  const { from, to } = financialMonthRangeByMonth(month, financialMonth);

  const [statuses, suggestions, migration, locale, t] = await Promise.all([
    getBillStatuses(month, financialMonth, UPCOMING_TYPES),
    listPendingSuggestions(),
    listMigrationReview(),
    getLocale(),
    getTranslations("upcoming"),
  ]);
  // A payment plan's row says which part is due: "Dentist · part 2 of 3".
  const billName = (item: (typeof statuses)[number]["item"], dueDate: string | null) => {
    const name = item.friendlyName ?? item.name;
    const part = dueDate ? planPartNumber(item, dueDate) : null;
    return part && item.planParts ? t("planPart", { name, part, parts: item.planParts }) : name;
  };

  const bills: UpcomingBill[] = statuses
    .map(({ item, icon, iconColor, iconBackground, dueDate, paid, paidSource, overdue }) => ({
      id: item.id,
      name: billName(item, dueDate),
      amount: item.amount,
      icon,
      iconColor,
      iconBackground,
      dueDate,
      // Unknown (no match pattern, no manual mark) counts as still to pay.
      paid: paid === true,
      paidSource,
      overdue,
      isIncome: item.type === "income",
    }))
    .sort((a, z) => (a.dueDate ?? "9999").localeCompare(z.dueDate ?? "9999") || a.name.localeCompare(z.name));

  // Named after the month the period ends in, like the Budget page: 25 Sep – 24 Oct is October.
  const end = new Date(`${to}T12:00:00`);
  const monthName = new Intl.DateTimeFormat(locale, { month: "long" }).format(end);
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(end);
  const href = (m: string) => (m === current ? "/transactions/upcoming" : `/transactions/upcoming?month=${m}`);

  return (
    <UpcomingView
      data={{
        month,
        monthName,
        monthLabel,
        from,
        to,
        today: todayStr(),
        isCurrent: month === current,
        nav: {
          prev: month > oldest ? href(offsetFinancialMonth(month, -1)) : null,
          next: month < newest ? href(offsetFinancialMonth(month, 1)) : null,
          today: month === current ? null : "/transactions/upcoming",
        },
        bills,
        suggestions,
        migration,
      }}
    />
  );
}

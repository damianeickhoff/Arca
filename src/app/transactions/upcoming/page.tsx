import { getLocale, getTranslations } from "next-intl/server";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { currentFinancialMonth, financialMonthRangeByMonth } from "@/lib/date-range";
import { getBillStatuses, UPCOMING_TYPES } from "@/lib/bill-status";
import { PageShell } from "@/components/page-container";
import { CategoryIcon } from "@/components/ui/category-icon";
import { SectionHead } from "@/components/ui/page-heading";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BillsCalendar, type CalendarBill } from "@/app/budget/bills-calendar";
import { billsDueTotal, hasPayableBill } from "@/lib/bill-amounts";
import { MobileSubpageHeader } from "@/components/mobile-menu-ui";
import { MoneyText } from "@/components/clear/money";

export const dynamic = "force-dynamic";

export default async function UpcomingTransactionsPage() {
  const financialMonth = await getFinancialMonthConfig();
  const month = currentFinancialMonth(financialMonth);
  const { from, to } = financialMonthRangeByMonth(month, financialMonth);
  const [t, locale] = await Promise.all([getTranslations("upcoming"), getLocale()]);

  const statuses = await getBillStatuses(month, financialMonth, UPCOMING_TYPES);
  // Upcoming = has a due date this financial month AND not yet paid.
  const upcoming = statuses.filter((s) => s.dueDate != null && s.paid !== true);

  const bills: CalendarBill[] = upcoming.map(({ item, icon, iconColor, iconBackground, dueDate, paid, paidSource, overdue }) => ({
    id: item.id,
    name: item.friendlyName ?? item.name,
    amount: item.amount,
    icon,
    iconColor,
    iconBackground,
    dueDate,
    paid,
    paidSource,
    overdue,
    isIncome: item.type === "income",
  }));

  // Group the list by due date (ascending), mirroring the transactions list layout.
  const byDate = new Map<string, CalendarBill[]>();
  for (const b of [...bills].sort((a, z) => (a.dueDate! < z.dueDate! ? -1 : 1))) {
    const list = byDate.get(b.dueDate!) ?? [];
    list.push(b);
    byDate.set(b.dueDate!, list);
  }

  // Expenses only — income is listed and shown on the calendar, but never netted into
  // the amount still to be paid.
  const total = billsDueTotal(bills);

  const fmtDay = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "long" });

  return (
    <div className="pb-24">
      <MobileSubpageHeader title={t("title")} backHref="/transactions" useHistoryBack />
      <PageShell bodyClassName="lg:pt-4">
        <BillsCalendar
          from={from}
          to={to}
          bills={bills}
          month={month}
          title={t("calendarTitle")}
          showPaidCount={false}
          dayMode="icons"
        />

        {bills.length === 0 ? (
          <div className="rounded-card border border-line bg-surface py-16 text-center text-[13px] text-ink-3 shadow-card">
            {t("empty")}
          </div>
        ) : (
          <section className="flex flex-col gap-3">
            <SectionHead title={t("listTitle")} link={<MoneyText>{formatEur(total)}</MoneyText>} />
            <div className="flex flex-col gap-3">
              {[...byDate.entries()].map(([date, items]) => (
                <div key={date} className="rounded-card border border-line bg-surface px-4 py-3 shadow-card lg:px-[18px]">
                  <div className="flex items-center justify-between pb-1">
                    <span className="mono-label text-[10px]">{fmtDay(date)}</span>
                    {items.length > 1 && hasPayableBill(items) && (
                      <span className="text-xs tabular-nums text-ink-3"><MoneyText>{formatEur(billsDueTotal(items))}</MoneyText></span>
                    )}
                  </div>
                  <div className="flex flex-col">
                    {items.map((b) => (
                      <div key={b.id} className="flex min-h-[54px] items-center gap-3">
                        <CategoryIcon icon={b.icon} color={b.iconColor} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{b.name}</span>
                        {b.amount != null && (
                          <span className={cn("shrink-0 text-sm font-semibold tabular-nums", b.isIncome ? "text-positive" : "text-ink")}>
                            {b.isIncome ? "+" : ""}
                            <MoneyText>{formatEur(b.amount)}</MoneyText>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </PageShell>
    </div>
  );
}

import { getFinancialMonthConfig } from "@/lib/app-settings";
import { currentFinancialMonth, financialMonthRangeByMonth } from "@/lib/date-range";
import { getBillStatuses, UPCOMING_TYPES } from "@/lib/bill-status";
import { PageContainer } from "@/components/page-container";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BillsCalendar, type CalendarBill } from "@/app/budget/bills-calendar";
import { signedBillAmount } from "@/lib/bill-amounts";
import { MobileSubpageHeader } from "@/components/mobile-menu-ui";

export const dynamic = "force-dynamic";

export default async function UpcomingTransactionsPage() {
  const financialMonth = await getFinancialMonthConfig();
  const month = currentFinancialMonth(financialMonth);
  const { from, to } = financialMonthRangeByMonth(month, financialMonth);

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

  // Net — income counts towards you, everything else against.
  const total = bills.reduce((sum, b) => sum + signedBillAmount(b), 0);

  const fmtDay = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" });

  const content = (
    <div className="pb-24 pt-13 space-y-4">
    <MobileSubpageHeader title="Upcoming" backHref="/transactions" useHistoryBack />

      <BillsCalendar
        from={from}
        to={to}
        bills={bills}
        month={month}
        title="Upcoming this month"
        showPaidCount={false}
        dayMode="icons"
      />

      {bills.length === 0 ? (
        <div className="rounded-2xl bg-card py-16 text-center text-muted-foreground text-sm">
          No upcoming transactions this month
        </div>
      ) : (
        <div className="space-y-4 px-4 ">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground px-2">Upcoming transactions</h2>
            <span className="text-sm text-muted-foreground tabular-nums px-2">{formatEur(total)}</span>
          </div>
          <div className="space-y-4">
            {[...byDate.entries()].map(([date, items]) => (
              <div key={date} className="rounded-lg bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">{fmtDay(date)}</span>
                  {items.length > 1 && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatEur(items.reduce((s, b) => s + signedBillAmount(b), 0))}
                    </span>
                  )}
                </div>
                <div className="space-y-2.5">
                  {items.map((b) => (
                    <div key={b.id} className="flex items-center gap-3">
                      <Icon iconKey={b.icon} size="md" color={b.iconColor} background={b.iconBackground} />
                      <span className="flex-1 text-sm font-medium truncate">{b.name}</span>
                      {b.amount != null && (
                        <span className={cn("text-sm tabular-nums", b.isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                          {b.isIncome ? "+" : ""}{formatEur(b.amount)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return <PageContainer className="px-0">{content}</PageContainer>;
}

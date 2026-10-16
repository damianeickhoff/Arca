"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconCalendarFilled } from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CategoryIcon } from "@/components/ui/category-icon";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { MarkPaidButton } from "@/app/mark-paid-button";
import { MoneyText } from "@/components/clear/money";

export type CalendarBill = {
  id: number;
  name: string;
  amount: number | null;
  icon: string | null;
  iconColor: string | null;
  iconBackground: string | null;
  dueDate: string | null; // YYYY-MM-DD
  paid: boolean | null;
  paidSource: "match" | "manual" | null;
  overdue: boolean;
  /** Money coming in rather than going out. Shown on the calendar and in the lists, but
   *  excluded from every "still to pay" total — see billsDueTotal in @/lib/bill-amounts
   *  (kept out of this file because it's "use client"). */
  isIncome?: boolean;
};

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Financial-month-aware calendar grid: spans from `from` to `to` (may straddle a
// calendar-month boundary when the financial month doesn't start on the 1st), padded
// to full Mon–Sun weeks at both ends. Mustard: the same calendar as the Budget page's
// bills card — mono day numbers, today on a mustard circle.
export function BillsCalendar({
  from,
  to,
  bills,
  month,
  title,
  showPaidCount = true,
  // "status" = coloured due-dots. "icons" = per-item icon, or the day's number of
  // items when several fall on one day (upcoming page).
  dayMode = "status",
}: {
  from: string;
  to: string;
  bills: CalendarBill[];
  month: string;
  title?: string;
  showPaidCount?: boolean;
  dayMode?: "status" | "icons";
}) {
  const t = useTranslations("bills");
  const locale = useLocale();
  const dateLocale = locale === "nl" ? "nl-NL" : "en-GB";
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const dated = bills.filter((b) => b.dueDate != null);
  const dateless = bills.filter((b) => b.dueDate == null);
  const byDate = new Map<string, CalendarBill[]>();
  for (const b of dated) {
    const list = byDate.get(b.dueDate!) ?? [];
    list.push(b);
    byDate.set(b.dueDate!, list);
  }

  const [fromY, fromM, fromD] = from.split("-").map(Number);
  const [toY, toM, toD] = to.split("-").map(Number);
  const gridStart = new Date(fromY, fromM - 1, fromD);
  // Mon=0..Sun=6
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));
  const gridEnd = new Date(toY, toM - 1, toD);
  gridEnd.setDate(gridEnd.getDate() + (7 - ((gridEnd.getDay() + 6) % 7) - 1));

  const days: { date: string; inRange: boolean; monthLabel: string | null }[] = [];
  const cursor = new Date(gridStart);
  let lastMonth = -1;
  while (cursor <= gridEnd) {
    const date = toDateStr(cursor);
    const inRange = date >= from && date <= to;
    const showMonthLabel = inRange && cursor.getMonth() !== lastMonth && cursor.getDate() <= 7;
    if (inRange) lastMonth = cursor.getMonth();
    days.push({
      date,
      inRange,
      monthLabel: showMonthLabel ? cursor.toLocaleDateString(dateLocale, { month: "short" }) : null,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const weekdays = [1, 2, 3, 4, 5, 6, 7].map((d) => new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2024, 0, d)));
  const todayStr = toDateStr(new Date());
  const paidCount = dated.filter((b) => b.paid).length;
  const selectedBills = selectedDay ? (byDate.get(selectedDay) ?? []) : [];

  return (
    <section className="rounded-card border border-line bg-surface p-[18px] shadow-card">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="heading text-[17px] text-ink">{title ?? t("calendarTitle")}</h2>
        {showPaidCount && dated.length > 0 && (
          <span className="text-xs font-semibold tabular-nums text-ink-3">{t("paidCount", { paid: paidCount, total: dated.length })}</span>
        )}
      </div>

      {dated.length === 0 && dateless.length === 0 ? (
        <EmptyState icon={IconCalendarFilled} title={t("noFixedCosts")} />
      ) : (
        <>
          {dated.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-7 gap-0.5">
                {weekdays.map((w, i) => (
                  <span key={i} className="text-center font-mono text-[10px] uppercase text-ink-3">{w}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {days.map(({ date, inRange, monthLabel }) => {
                  const dayBills = byDate.get(date) ?? [];
                  const hasBills = dayBills.length > 0;
                  const allPaid = hasBills && dayBills.every((b) => b.paid);
                  const anyOverdue = dayBills.some((b) => b.overdue);
                  const isToday = date === todayStr;
                  const dayNum = Number(date.slice(8, 10));
                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={!inRange || !hasBills}
                      onClick={() => setSelectedDay(date)}
                      className={cn(
                        "relative flex flex-col items-center gap-[3px] font-mono text-[11px] tabular-nums transition-colors",
                        dayMode === "icons" ? "justify-start rounded-tile py-1" : "h-[34px] justify-center rounded-full",
                        !inRange ? "text-transparent" : date < todayStr ? "text-ink-3" : "text-ink",
                        hasBills && inRange ? "cursor-pointer hover:bg-surface-2" : "cursor-default",
                        isToday && inRange && dayMode === "status" && "bg-mustard text-mustard-ink hover:bg-mustard",
                      )}
                    >
                      {monthLabel && (
                        <span className="absolute -top-0.5 left-0 font-mono text-[8px] uppercase text-ink-3">{monthLabel}</span>
                      )}
                      <span
                        className={cn(
                          "leading-none",
                          isToday && inRange && dayMode === "icons" && "rounded-full bg-mustard px-1.5 py-0.5 text-mustard-ink",
                        )}
                      >
                        {dayNum}
                      </span>
                      {hasBills && inRange ? (
                        dayMode === "icons" ? (
                          dayBills.length === 1 ? (
                            <CategoryIcon icon={dayBills[0].icon} color={dayBills[0].iconColor} size="sm" />
                          ) : (
                            <span className="flex size-6 items-center justify-center rounded-full bg-ink text-[10px] font-bold leading-none text-bg tabular-nums">
                              {dayBills.length}
                            </span>
                          )
                        ) : (
                          <span
                            className={cn(
                              "size-[5px] rounded-full",
                              isToday ? "bg-mustard-ink" : allPaid ? "bg-positive" : anyOverdue ? "bg-negative" : "bg-ink-3",
                            )}
                          />
                        )
                      ) : (
                        dayMode === "status" && <span className="size-[5px]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {dateless.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="mono-label mb-1 text-[10px]">{t("noFixedDate")}</p>
              <div className="flex flex-col">
                {dateless.map((b) => (
                  <BillLine key={b.id} bill={b} month={month} paidLabel={t("paid")} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={selectedDay != null} onOpenChange={(v) => !v && setSelectedDay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedDay ? new Date(selectedDay + "T00:00:00").toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long" }) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col">
            {selectedBills.map((b) => (
              <BillLine key={b.id} bill={b} month={month} paidLabel={t("paid")} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** One bill: icon, name, amount and the mark-paid toggle (or "Paid" when a transaction matched it). */
function BillLine({ bill: b, month, paidLabel }: { bill: CalendarBill; month: string; paidLabel: string }) {
  return (
    <div className="flex min-h-[54px] items-center gap-3 border-b border-line last:border-0">
      <CategoryIcon icon={b.icon} color={b.iconColor} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{b.name}</span>
      {b.amount != null && (
        <span className={cn("shrink-0 text-sm font-semibold tabular-nums", b.isIncome ? "text-positive" : "text-ink")}>
          {b.isIncome ? "+" : ""}
          <MoneyText>{formatEur(b.amount)}</MoneyText>
        </span>
      )}
      {b.paidSource === "match" ? (
        <span className="shrink-0 text-[11px] font-bold text-positive">{paidLabel}</span>
      ) : (
        <MarkPaidButton recurringItemId={b.id} month={month} paid={b.paid === true} />
      )}
    </div>
  );
}

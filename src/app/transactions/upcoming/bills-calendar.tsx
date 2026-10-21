"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { IconCheck, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearCard } from "@/components/clear/card";
import { ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { MoneyText } from "@/components/clear/money";
import { billsDueTotal, hasPayableBill } from "@/lib/bill-amounts";
import { formatEur, formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UpcomingBill, UpcomingData } from "./upcoming-view";
import { BillRow } from "./bill-row";

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The chip a bill gets on its day: paid (mint, ticked), income (mint), overdue (rose) or to pay (peach). */
function chipTone(b: UpcomingBill) {
  if (b.isIncome) return "bg-clear-mint text-clear-mint-ink ring-1 ring-inset ring-clear-positive-fill";
  if (b.paid) return "bg-clear-mint text-clear-mint-ink";
  if (b.overdue) return "bg-clear-rose text-clear-negative";
  return "bg-clear-peach text-clear-ember-text";
}

/** The phone dot for the same states. */
function dotTone(b: UpcomingBill) {
  if (b.isIncome) return "bg-clear-mint ring-1 ring-clear-positive-fill";
  if (b.paid) return "bg-clear-positive-fill";
  if (b.overdue) return "bg-clear-negative";
  return "bg-clear-ember";
}

/** How many chips a day shows before "+N". */
const MAX_CHIPS = 2;

/**
 * The month's bills on a Mon–Sun grid spanning the financial month (`from`–`to`, which
 * may straddle two calendar months), padded to whole weeks. Each day carries a chip
 * per bill (phones: a dot); today is the black cell, a payday says so. A day with bills
 * opens its list, where each one can be marked paid. The header steps between months.
 */
export function BillsCalendar({ data }: { data: UpcomingData }) {
  const t = useTranslations("upcoming.calendar");
  const tUp = useTranslations("upcoming");
  const locale = useLocale();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const { from, to, today, bills, nav } = data;

  const byDate = new Map<string, UpcomingBill[]>();
  for (const b of bills) {
    if (!b.dueDate) continue;
    const list = byDate.get(b.dueDate) ?? [];
    list.push(b);
    byDate.set(b.dueDate, list);
  }

  const [fromY, fromM, fromD] = from.split("-").map(Number);
  const [toY, toM, toD] = to.split("-").map(Number);
  const gridStart = new Date(fromY, fromM - 1, fromD);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7)); // back to Monday
  const gridEnd = new Date(toY, toM - 1, toD);
  gridEnd.setDate(gridEnd.getDate() + (6 - ((gridEnd.getDay() + 6) % 7))); // on to Sunday

  const shortMonth = new Intl.DateTimeFormat(locale, { month: "short" });
  const longDay = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });
  const days: { date: string; num: number; inRange: boolean; monthNote: string | null }[] = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const date = toDateStr(cursor);
    const inRange = date >= from && date <= to;
    // A financial month that straddles two calendar months names the month where it
    // starts and where the new one begins.
    const monthNote = inRange && (date === from || cursor.getDate() === 1) && fromD !== 1 ? shortMonth.format(cursor) : null;
    days.push({ date, num: cursor.getDate(), inRange, monthNote });
    cursor.setDate(cursor.getDate() + 1);
  }

  const weekdayShort = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const weekdayNarrow = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  // 1–7 Jan 2024 is Monday to Sunday.
  const weekdays = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
    short: weekdayShort.format(new Date(2024, 0, d)),
    narrow: weekdayNarrow.format(new Date(2024, 0, d)),
  }));

  const selectedBills = selectedDay ? (byDate.get(selectedDay) ?? []) : [];
  const selectedDue = selectedBills.filter((b) => !b.paid);
  const navBtn = "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-clear-ground text-clear-ink transition-colors";

  return (
    <ClearCard aria-labelledby="upcoming-calendar-title" className="gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div data-tip-anchor="upcomingMonthNav" className="flex items-center gap-2.5">
          {nav.prev ? (
            <Link href={nav.prev} scroll={false} aria-label={t("previous")} className={cn(navBtn, "hover:bg-clear-line")}>
              <IconChevronLeft size={18} stroke={2.2} aria-hidden />
            </Link>
          ) : (
            <span aria-hidden className={cn(navBtn, "text-clear-placeholder")}>
              <IconChevronLeft size={18} stroke={2.2} />
            </span>
          )}
          <h2 id="upcoming-calendar-title" aria-live="polite" className="m-0 min-w-[132px] text-center text-lg font-bold first-letter:uppercase">
            {data.monthLabel}
          </h2>
          {nav.next ? (
            <Link href={nav.next} scroll={false} aria-label={t("next")} className={cn(navBtn, "hover:bg-clear-line")}>
              <IconChevronRight size={18} stroke={2.2} aria-hidden />
            </Link>
          ) : (
            <span aria-hidden className={cn(navBtn, "text-clear-placeholder")}>
              <IconChevronRight size={18} stroke={2.2} />
            </span>
          )}
          {nav.today && (
            <Link href={nav.today} scroll={false} className={cn(clearButtonVariants({ variant: "outline", size: "sm" }), "border-clear-line text-clear-ink")}>
              {t("today")}
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] font-semibold text-clear-ink-2">
          <LegendKey className="bg-clear-positive-fill">{t("legend.paid")}</LegendKey>
          <LegendKey className="bg-clear-ember">{t("legend.due")}</LegendKey>
          <LegendKey className="bg-clear-mint ring-1 ring-inset ring-clear-positive-fill">{t("legend.income")}</LegendKey>
          <LegendKey className="bg-clear-primary">{t("legend.today")}</LegendKey>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 sm:gap-2">
        {/* The weekday names; every day says its full date to screen readers itself. */}
        <div aria-hidden className="grid grid-cols-7 gap-1 sm:gap-2">
          {weekdays.map((w, i) => (
            <span key={i} className="px-1 text-center text-xs font-bold text-clear-muted sm:px-2 sm:text-left sm:text-[13px]">
              <span className="sm:hidden">{w.narrow}</span>
              <span className="hidden sm:inline">{w.short}</span>
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {days.map(({ date, num, inRange, monthNote }) => {
            const dayBills = inRange ? (byDate.get(date) ?? []) : [];
            const isToday = inRange && date === today;
            const payday = dayBills.some((b) => b.isIncome);
            const note = isToday ? t("today") : payday ? t("payday") : monthNote;
            const label = dayBills.length
              ? `${longDay.format(new Date(`${date}T12:00:00`))}: ${dayBills
                  .map((b) => (b.amount != null ? `${b.name} ${formatEur(b.amount)}` : b.name))
                  .join(", ")}`
              : longDay.format(new Date(`${date}T12:00:00`));
            const shown = dayBills.slice(0, MAX_CHIPS);
            const extra = dayBills.length - shown.length;

            const cellClass = cn(
              "flex min-h-[52px] min-w-0 flex-col gap-1 rounded-clear-row p-1.5 text-left sm:min-h-[92px] sm:p-2",
              !inRange && "bg-transparent text-clear-placeholder",
              inRange && (isToday ? "bg-clear-primary text-clear-primary-ink" : "bg-clear-tile"),
              inRange && !isToday && (date < today ? "text-clear-muted" : "text-clear-ink"),
            );
            const body = (
              <>
                <span className="flex items-baseline justify-between gap-1">
                  <span className="text-sm font-extrabold tabular-nums">{num}</span>
                  {note && (
                    <span
                      className={cn(
                        "hidden truncate text-xs font-bold sm:inline",
                        isToday ? "text-clear-primary-ink/70" : payday ? "text-clear-positive" : "text-clear-muted",
                      )}
                    >
                      {note}
                    </span>
                  )}
                </span>
                {dayBills.length > 0 && (
                  <>
                    {/* Phones: one dot per bill. */}
                    <span aria-hidden className="mt-auto flex flex-wrap gap-[3px] sm:hidden">
                      {dayBills.slice(0, 4).map((b) => (
                        <span key={`${b.id}-${b.dueDate}`} className={cn("size-[7px] rounded-full", dotTone(b))} />
                      ))}
                    </span>
                    <span aria-hidden className="mt-auto hidden flex-col items-start gap-1 sm:flex">
                      {shown.map((b) => (
                        <span
                          key={`${b.id}-${b.dueDate}`}
                          className={cn(
                            "inline-flex h-[22px] max-w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-full px-[7px] text-xs font-bold tabular-nums",
                            chipTone(b),
                          )}
                        >
                          {b.paid && !b.isIncome && <IconCheck className="size-3 shrink-0" stroke={3} />}
                          <span className="truncate">
                            <MoneyText>
                              {b.amount == null ? b.name : b.isIncome ? `+${formatEurWhole(b.amount)}` : formatEur(b.amount)}
                            </MoneyText>
                          </span>
                        </span>
                      ))}
                      {extra > 0 && (
                        <span className={cn("px-1 text-xs font-bold", isToday ? "text-clear-primary-ink/70" : "text-clear-muted")}>
                          {t("more", { count: extra })}
                        </span>
                      )}
                    </span>
                  </>
                )}
              </>
            );

            return dayBills.length > 0 ? (
              <button
                key={date}
                type="button"
                aria-label={label}
                aria-haspopup="dialog"
                onClick={() => setSelectedDay(date)}
                className={cn(cellClass, "cursor-pointer outline-none transition-[box-shadow] hover:ring-[1.5px] hover:ring-inset hover:ring-clear-ember/40 focus-visible:ring-3 focus-visible:ring-clear-ember/50")}
              >
                {body}
              </button>
            ) : (
              <div key={date} aria-label={inRange ? label : undefined} aria-hidden={!inRange || undefined} className={cellClass}>
                {body}
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={selectedDay != null} onOpenChange={(v) => !v && setSelectedDay(null)}>
        <DialogContent
          hideHeaderRow
          title={selectedDay ? longDay.format(new Date(`${selectedDay}T12:00:00`)) : t("dayTitle")}
          className="gap-4 pt-6 font-clear text-clear-ink lg:w-[560px] lg:max-w-full lg:pt-7"
        >
          <ClearDialogHeader
            title={<span className="first-letter:uppercase">{selectedDay ? longDay.format(new Date(`${selectedDay}T12:00:00`)) : ""}</span>}
            subtitle={hasPayableBill(selectedDue) ? t("dayTotal", { amount: formatEur(billsDueTotal(selectedDue)) }) : undefined}
            onClose={() => setSelectedDay(null)}
            closeLabel={tUp("close")}
          />
          <ul className="m-0 flex list-none flex-col p-0">
            {selectedBills.map((b) => (
              <BillRow key={`${b.id}-${b.dueDate}`} bill={b} month={data.month} today={today} />
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </ClearCard>
  );
}

function LegendKey({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2.5 rounded-[3px]", className)} />
      {children}
    </span>
  );
}

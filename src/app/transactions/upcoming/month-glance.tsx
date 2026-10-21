"use client";

import { useLocale, useTranslations } from "next-intl";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { busiestDay, dotSize } from "@/lib/upcoming-plan";
import { formatEur, formatEurWhole } from "@/lib/format";
import { shiftDate } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import type { UpcomingBill, UpcomingData } from "./upcoming-view";
import { useDates } from "./use-dates";

/** A bill's dot on the grid: paid, to pay, overdue or income (ringed). */
function dotClass(b: UpcomingBill) {
  if (b.isIncome) return "bg-clear-card ring-[1.5px] ring-inset ring-clear-positive";
  if (b.paid) return "bg-clear-positive-fill";
  if (b.overdue) return "bg-clear-negative";
  return "bg-clear-ember";
}

/** How many dots a day shows. */
const MAX_DOTS = 3;

/**
 * The month on a compact Monday–Sunday grid spanning the financial month (which may
 * straddle two calendar months): one dot per bill, sized by its amount, so the busy
 * days stand out. Today is black, an overdue day has an ember ring. Tapping a day
 * narrows the bills list to it; tapping it again shows every day.
 */
export function MonthGlance({ data, day, onDay }: { data: UpcomingData; day: string | null; onDay: (day: string) => void }) {
  const t = useTranslations("upcoming.glance");
  const locale = useLocale();
  const d = useDates();
  const { from, to, today } = data;
  const bills = data.bills.filter((b) => !b.skipped && b.dueDate);
  const byDate = new Map<string, UpcomingBill[]>();
  for (const b of bills) byDate.set(b.dueDate!, [...(byDate.get(b.dueDate!) ?? []), b]);
  const busiest = busiestDay(data.bills);

  // Padded to whole weeks: back to Monday, on to Sunday.
  const weekday = (date: string) => (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
  const start = shiftDate(from, -weekday(from));
  const end = shiftDate(to, 6 - weekday(to));
  const cells: string[] = [];
  for (let c = start; c <= end; c = shiftDate(c, 1)) cells.push(c);

  const narrow = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  // 1–7 Jan 2024 is Monday to Sunday.
  const weekdays = [1, 2, 3, 4, 5, 6, 7].map((n) => narrow.format(new Date(2024, 0, n)));

  return (
    <ClearCard aria-labelledby="upcoming-glance-title" className="gap-3">
      <ClearCardHeader
        title={<span id="upcoming-glance-title">{t("title", { month: data.monthName })}</span>}
        subtitle={busiest ? t("busiest", { date: d.day(busiest.date), amount: formatEurWhole(busiest.total) }) : t("quiet")}
      />
      <div className="flex flex-col gap-1">
        <div aria-hidden className="grid grid-cols-7 gap-1">
          {weekdays.map((w, i) => (
            <span key={i} className="pl-1.5 text-xs font-semibold text-clear-muted">{w}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date) => {
            const inRange = date >= from && date <= to;
            const list = inRange ? (byDate.get(date) ?? []) : [];
            const isToday = inRange && date === today;
            const overdue = list.some((b) => b.overdue);
            const selected = day === date;
            const num = Number(date.slice(8));
            const cell = cn(
              "relative flex h-[42px] min-w-0 flex-col items-start overflow-hidden rounded-clear-icon px-1.5 pt-1 text-xs font-semibold tabular-nums",
              !inRange && "text-clear-placeholder",
              inRange && (isToday ? "bg-clear-primary text-clear-primary-ink" : "bg-clear-tile"),
              inRange && !isToday && (date < today ? "text-clear-muted" : "text-clear-ink"),
              overdue && !isToday && "ring-[1.5px] ring-inset ring-clear-ember",
              selected && "ring-2 ring-inset ring-clear-ink",
            );
            const dots = list.length > 0 && (
              <span aria-hidden className="absolute bottom-1.5 left-1.5 flex items-center gap-[3px]">
                {list.slice(0, MAX_DOTS).map((b, i) => {
                  const size = dotSize(b.amount);
                  return <span key={i} className={cn("block shrink-0 rounded-full", dotClass(b))} style={{ width: size, height: size }} />;
                })}
              </span>
            );
            if (list.length === 0) {
              return (
                <span key={date} aria-hidden={!inRange || undefined} className={cell}>
                  {num}
                </span>
              );
            }
            const label = `${d.long(date)}: ${list.map((b) => (b.amount != null ? `${b.name} ${formatEur(b.amount)}` : b.name)).join(", ")}`;
            return (
              <button
                key={date}
                type="button"
                aria-label={label}
                aria-pressed={selected}
                onClick={() => onDay(date)}
                className={cn(cell, "cursor-pointer outline-none transition-shadow hover:ring-[1.5px] hover:ring-inset hover:ring-clear-ink/30 focus-visible:ring-3 focus-visible:ring-clear-ember/50")}
              >
                {num}
                {dots}
              </button>
            );
          })}
        </div>
      </div>
      <div aria-hidden className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs font-semibold text-clear-ink-2">
        <Legend className="bg-clear-positive-fill">{t("paid")}</Legend>
        <Legend className="bg-clear-ember">{t("due")}</Legend>
        <Legend className="bg-clear-negative">{t("overdue")}</Legend>
        <Legend className="bg-clear-card ring-[1.5px] ring-inset ring-clear-positive">{t("income")}</Legend>
        <span className="text-clear-muted">{t("sizes")}</span>
      </div>
    </ClearCard>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} />
      {children}
    </span>
  );
}

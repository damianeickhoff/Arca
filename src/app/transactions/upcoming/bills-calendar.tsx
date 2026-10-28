"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { IconCheck, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { ClearCard } from "@/components/clear/card";
import { MoneyText } from "@/components/clear/money";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { billsTotal } from "@/lib/bill-groups";
import { currencySymbol, formatEur, formatEurWhole } from "@/lib/format";
import { shiftDate } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import type { UpcomingBill, UpcomingData } from "./upcoming-view";
import { useDates } from "./use-dates";

/** How many amount chips a day shows on desktop; past that the last one says "+2". */
const MAX_CHIPS = 3;

/** A bill's chip: mint (with a tick) when paid, peach while still to pay, mint for income. */
function chipClass(b: UpcomingBill) {
  if (b.isIncome || b.paid) return "bg-clear-mint text-clear-mint-ink";
  return "bg-clear-peach text-clear-ember-text";
}

/** "1.126" or "+3.650": a whole amount without the currency sign, for the phone cells. */
const bare = (amount: number) => formatEurWhole(amount).replace(currencySymbol(), "");

/**
 * The month as a big Monday–Sunday calendar spanning the financial month (which may
 * straddle two calendar months), with the month stepper and a legend. Desktop: tall
 * cells with the day number, a "Today" / "Payday" note and one amount chip per bill.
 * Phones: compact cells with the number and the day's total in coloured text. Today is
 * black, a day with an overdue bill has an ember ring. Tapping a day narrows the Still
 * due list to it; tapping it again shows every day.
 */
export function BillsCalendar({
  data,
  day,
  onDay,
  className,
}: {
  data: UpcomingData;
  day: string | null;
  onDay: (day: string) => void;
  className?: string;
}) {
  const t = useTranslations("upcoming.calendar");
  const locale = useLocale();
  const d = useDates();
  const { from, to, today } = data;
  const bills = data.bills.filter((b) => !b.skipped && b.dueDate);
  const byDate = new Map<string, UpcomingBill[]>();
  for (const b of bills) byDate.set(b.dueDate!, [...(byDate.get(b.dueDate!) ?? []), b]);

  // Padded to whole weeks: back to Monday, on to Sunday.
  const weekday = (date: string) => (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
  const start = shiftDate(from, -weekday(from));
  const end = shiftDate(to, 6 - weekday(to));
  const cells: string[] = [];
  for (let c = start; c <= end; c = shiftDate(c, 1)) cells.push(c);

  // 1–7 Jan 2024 is Monday to Sunday.
  const week = [1, 2, 3, 4, 5, 6, 7].map((n) => new Date(2024, 0, n));
  const narrow = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  const short = new Intl.DateTimeFormat(locale, { weekday: "short" });

  return (
    <ClearCard aria-label={t("label", { month: data.monthLabel })} className={cn("gap-3 px-4 py-[18px] lg:gap-4 lg:p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthStepper data={data} />
        <div aria-hidden className="hidden flex-wrap gap-3.5 text-[13px] font-semibold text-clear-ink-2 lg:flex">
          <Legends withToday />
        </div>
      </div>

      <div className="flex flex-col gap-1 lg:gap-2">
        <div aria-hidden className="grid grid-cols-7 gap-1 lg:gap-2">
          {week.map((w, i) => (
            <span key={i} className="text-center text-[13px] font-bold text-clear-muted lg:px-2 lg:text-left">
              <span className="lg:hidden">{narrow.format(w)}</span>
              <span className="hidden first-letter:uppercase lg:inline-block">{short.format(w)}</span>
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 lg:gap-2">
          {cells.map((date) => {
            const inRange = date >= from && date <= to;
            const list = inRange ? (byDate.get(date) ?? []) : [];
            const isToday = inRange && date === today;
            const out = list.filter((b) => !b.isIncome);
            const income = list.filter((b) => b.isIncome);
            const payday = income.length > 0;
            const overdue = list.some((b) => b.overdue);
            const selected = day === date;
            const num = Number(date.slice(8));
            const note = isToday ? t("today") : payday ? t("payday") : null;

            // Phones show the day's total: what leaves (ember while any of it is unpaid,
            // mint once paid), else the income coming in.
            const outTotal = billsTotal(out);
            const inTotal = income.reduce((s, b) => s + (b.amount ?? 0), 0);
            const compact =
              outTotal > 0
                ? { text: bare(outTotal), tone: out.some((b) => !b.paid) ? "text-clear-ember-text" : "text-clear-positive" }
                : inTotal > 0
                  ? { text: `+${bare(inTotal)}`, tone: "text-clear-positive" }
                  : null;
            const shown = list.length > MAX_CHIPS ? MAX_CHIPS - 1 : MAX_CHIPS;

            const cell = cn(
              "relative flex h-[52px] min-w-0 flex-col items-center justify-between overflow-hidden rounded-clear-icon px-0.5 pt-[5px] pb-1 tabular-nums",
              "lg:h-auto lg:min-h-[92px] lg:items-stretch lg:justify-start lg:gap-1 lg:rounded-clear-row lg:p-2",
              !inRange && "text-clear-placeholder",
              inRange && (isToday ? "bg-clear-primary text-clear-primary-ink" : payday ? "bg-clear-mint lg:bg-clear-tile" : "bg-clear-tile"),
              inRange && !isToday && (date < today ? "text-clear-muted" : "text-clear-ink"),
              overdue && !isToday && "ring-2 ring-inset ring-clear-ember",
              selected && "ring-2 ring-inset ring-clear-ink",
            );

            const content = (
              <>
                <span className="flex items-baseline justify-between gap-1">
                  <span className="text-[13px] font-extrabold lg:text-sm">{num}</span>
                  {note && (
                    <span className={cn("hidden truncate text-xs font-bold lg:inline", isToday ? "text-clear-primary-ink/70" : "text-clear-positive")}>
                      {note}
                    </span>
                  )}
                </span>
                {compact && (
                  <span className={cn("money text-xs font-extrabold tracking-[-0.02em] whitespace-nowrap lg:hidden", isToday ? "text-clear-primary-ink" : compact.tone)}>
                    {compact.text}
                  </span>
                )}
                {list.length > 0 && (
                  <span className="mt-auto hidden flex-col items-start gap-1 lg:flex">
                    {list.slice(0, shown).map((b) => (
                      <span
                        key={`${b.id}-${b.name}`}
                        title={b.name}
                        className={cn(
                          "inline-flex h-[22px] max-w-full shrink-0 items-center gap-1 overflow-hidden rounded-full px-[7px] text-xs font-bold whitespace-nowrap",
                          chipClass(b),
                        )}
                      >
                        {b.paid && !b.isIncome && <IconCheck size={12} stroke={3} aria-hidden className="shrink-0" />}
                        <MoneyText>{b.amount != null ? (b.isIncome ? `+${formatEurWhole(b.amount)}` : formatEur(b.amount)) : b.name}</MoneyText>
                      </span>
                    ))}
                    {list.length > shown && (
                      <span className="inline-flex h-[22px] items-center rounded-full bg-clear-card px-[7px] text-xs font-bold text-clear-ink-2">
                        {t("more", { count: list.length - shown })}
                      </span>
                    )}
                  </span>
                )}
              </>
            );

            if (list.length === 0) {
              return (
                <span key={date} aria-hidden={!inRange || undefined} className={cell}>
                  {content}
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
                className={cn(cell, "cursor-pointer text-left outline-none transition-shadow hover:ring-2 hover:ring-inset hover:ring-clear-ink/30 focus-visible:ring-3 focus-visible:ring-clear-ember/50")}
              >
                {content}
              </button>
            );
          })}
        </div>
      </div>

      <div aria-hidden className="flex flex-wrap gap-3 text-[13px] font-semibold text-clear-ink-2 lg:hidden">
        <Legends />
      </div>
    </ClearCard>
  );
}

function Legends({ withToday = false }: { withToday?: boolean }) {
  const t = useTranslations("upcoming.calendar");
  return (
    <>
      <Legend className="bg-clear-positive-fill">{t("paid")}</Legend>
      <Legend className="bg-clear-ember">{t("due")}</Legend>
      <Legend className="bg-clear-mint ring-1 ring-inset ring-clear-positive-fill">{t("income")}</Legend>
      {withToday && <Legend className="bg-clear-primary">{t("today")}</Legend>}
    </>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-[3px]", className)} />
      {children}
    </span>
  );
}

/** "‹ October 2026 ›", with "Today" when looking at another month. */
function MonthStepper({ data }: { data: UpcomingData }) {
  const t = useTranslations("upcoming.nav");
  const { nav } = data;
  const btn = "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-clear-tile text-clear-ink transition-colors";
  const arrow = (href: string | null, label: string, Icon: typeof IconChevronLeft) =>
    href ? (
      <Link href={href} scroll={false} aria-label={label} className={cn(btn, "hover:bg-clear-line")}>
        <Icon size={18} stroke={2.2} aria-hidden />
      </Link>
    ) : (
      <span aria-hidden className={cn(btn, "text-clear-placeholder")}>
        <Icon size={18} stroke={2.2} />
      </span>
    );
  return (
    <div className="flex w-full items-center gap-2 lg:w-auto">
      <div data-tip-anchor="upcomingMonthNav" className="flex flex-1 items-center justify-between gap-2.5 lg:flex-none">
        {arrow(nav.prev, t("previous"), IconChevronLeft)}
        <h2 aria-live="polite" className="m-0 min-w-[140px] text-center text-lg font-bold whitespace-nowrap first-letter:uppercase">
          {data.monthLabel}
        </h2>
        {arrow(nav.next, t("next"), IconChevronRight)}
      </div>
      {nav.today && (
        <Link href={nav.today} scroll={false} className={clearButtonVariants({ variant: "secondary", size: "sm" })}>
          {t("today")}
        </Link>
      )}
    </div>
  );
}

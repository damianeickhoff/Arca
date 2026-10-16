"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { IconCalendar, IconChevronDown, IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import { ResponsivePopover } from "@/components/clear/responsive-popover";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { ClearField, ClearInput } from "@/components/clear/field";
import { filterPillClass } from "@/components/filter-pill";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { cn } from "@/lib/utils";
import {
  daysInclusive,
  financialMonthRange,
  financialMonthRangeByMonth,
  financialMonthForDate,
  offsetFinancialMonth,
  shiftDate,
  type FinancialMonthConfig,
} from "@/lib/date-range";

type Preset = "budget" | "week" | "month" | "3m" | "6m" | "year" | "custom";
type Range = { from: string; to: string };

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function today() {
  return toDateStr(new Date());
}

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return toDateStr(d);
}

function setRangeCookie(name: "date_from" | "date_to", value: string) {
  document.cookie = `${name}=${value};path=/;max-age=31536000;SameSite=Lax`;
}

// Labels live at insights.period.presets.<value>.
const PRESET_OPTIONS: Exclude<Preset, "custom" | "budget">[] = ["week", "month", "3m", "6m", "year"];

/** [from,to] for every fixed preset, anchored to today. */
function presetRange(preset: Exclude<Preset, "custom" | "budget">, financialMonth: FinancialMonthConfig): Range {
  const year = new Date().getFullYear();
  switch (preset) {
    case "week": {
      const from = startOfWeek();
      return { from, to: shiftDate(from, 6) };
    }
    case "month":
      return calendarMonthRange(today());
    case "3m":
      return { from: financialMonthRange(financialMonth, -2).from, to: financialMonthRange(financialMonth, 0).to };
    case "6m":
      return { from: financialMonthRange(financialMonth, -5).from, to: financialMonthRange(financialMonth, 0).to };
    case "year":
      return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
}

function isWeekSpan(from: string, to: string): boolean {
  return new Date(`${from}T00:00:00`).getDay() === 1 && shiftDate(from, 6) === to;
}

function isFinancialMonthSpan(from: string, to: string, financialMonth: FinancialMonthConfig): boolean {
  const r = financialMonthRangeByMonth(financialMonthForDate(from, financialMonth), financialMonth);
  return r.from === from && r.to === to;
}

/** The calendar month `date` falls in. "Month" is a calendar concept; only "Budget"
 *  follows the financial-month configuration. */
function calendarMonthRange(date: string): Range {
  const d = new Date(`${date}T00:00:00`);
  return { from: toDateStr(new Date(d.getFullYear(), d.getMonth(), 1)), to: toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}

function isCalendarMonthSpan(from: string, to: string): boolean {
  if (!from.endsWith("-01")) return false;
  return calendarMonthRange(from).to === to;
}

function shiftCalendarMonths(from: string, months: number): Range {
  const d = new Date(`${from}T00:00:00`);
  return calendarMonthRange(toDateStr(new Date(d.getFullYear(), d.getMonth() + months, 1)));
}

/** Whether [from,to] is a `months`-long run of financial months ending exactly at `to`. */
function isRollingMonthsSpan(from: string, to: string, months: number, financialMonth: FinancialMonthConfig): boolean {
  const toMonth = financialMonthForDate(to, financialMonth);
  if (financialMonthRangeByMonth(toMonth, financialMonth).to !== to) return false;
  return financialMonthRangeByMonth(offsetFinancialMonth(toMonth, -(months - 1)), financialMonth).from === from;
}

function isYearSpan(from: string, to: string): boolean {
  return /^\d{4}-01-01$/.test(from) && /^\d{4}-12-31$/.test(to) && from.slice(0, 4) === to.slice(0, 4);
}

/** Classifies [from,to] by shape, so stepping to last week still reads as "Week".
 *  "Budget" only matches the budget's exact live period. */
function detectPreset(from: string, to: string, financialMonth: FinancialMonthConfig, budgetPeriod: Range | null): Preset {
  if (budgetPeriod && from === budgetPeriod.from && to === budgetPeriod.to) return "budget";
  if (isWeekSpan(from, to)) return "week";
  if (isCalendarMonthSpan(from, to)) return "month";
  if (isRollingMonthsSpan(from, to, 3, financialMonth)) return "3m";
  if (isRollingMonthsSpan(from, to, 6, financialMonth)) return "6m";
  if (isYearSpan(from, to)) return "year";
  return "custom";
}

/** Shifts [from,to] by whole financial months, boundary by boundary. */
function shiftByMonths(from: string, to: string, months: number, financialMonth: FinancialMonthConfig): Range {
  return {
    from: financialMonthRangeByMonth(offsetFinancialMonth(financialMonthForDate(from, financialMonth), months), financialMonth).from,
    to: financialMonthRangeByMonth(offsetFinancialMonth(financialMonthForDate(to, financialMonth), months), financialMonth).to,
  };
}

function shiftRange(preset: Preset, from: string, to: string, direction: 1 | -1, financialMonth: FinancialMonthConfig): Range {
  switch (preset) {
    case "budget": {
      // The live budget period is a week or a financial month: step it the same way.
      if (isWeekSpan(from, to)) return { from: shiftDate(from, 7 * direction), to: shiftDate(to, 7 * direction) };
      if (isFinancialMonthSpan(from, to, financialMonth)) return shiftByMonths(from, to, direction, financialMonth);
      const days = daysInclusive(from, to);
      return { from: shiftDate(from, days * direction), to: shiftDate(to, days * direction) };
    }
    case "week":
      return { from: shiftDate(from, 7 * direction), to: shiftDate(to, 7 * direction) };
    case "month":
      return shiftCalendarMonths(from, direction);
    case "3m":
      return shiftByMonths(from, to, 3 * direction, financialMonth);
    case "6m":
      return shiftByMonths(from, to, 6 * direction, financialMonth);
    case "year":
      return { from: `${Number(from.slice(0, 4)) + direction}-01-01`, to: `${Number(to.slice(0, 4)) + direction}-12-31` };
    case "custom": {
      const days = daysInclusive(from, to);
      return { from: shiftDate(from, days * direction), to: shiftDate(to, days * direction) };
    }
  }
}

function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", options);
}

function fmtRange(from: string, to: string, locale: string, withYear = false) {
  const f = dateFormatter(locale, { day: "numeric", month: "short" });
  const fy = dateFormatter(locale, { day: "numeric", month: "short", year: "numeric" });
  const d = (s: string) => new Date(`${s}T00:00:00`);
  return `${f.format(d(from))} – ${(withYear ? fy : f).format(d(to))}`;
}

/**
 * How many whole budget months [from,to] covers, or 0 when it doesn't start on a budget
 * month's first day and end on one's last day.
 */
function budgetMonthCount(from: string, to: string, financialMonth: FinancialMonthConfig): number {
  const first = financialMonthForDate(from, financialMonth);
  const last = financialMonthForDate(to, financialMonth);
  if (financialMonthRangeByMonth(first, financialMonth).from !== from) return 0;
  if (financialMonthRangeByMonth(last, financialMonth).to !== to) return 0;
  let count = 1;
  for (let m = first; m < last; m = offsetFinancialMonth(m, 1)) count++;
  return count;
}

/** Budget months by name, after the month they end in like the Budget page (25 Sep –
 *  24 Oct is "October"); several as "Aug – Oct", with the year when it isn't this one. */
function budgetMonthsLabel(from: string, to: string, count: number, locale: string, financialMonth: FinancialMonthConfig) {
  const d = (s: string) => new Date(`${s}T00:00:00`);
  const thisYear = new Date().getFullYear();
  const firstEnd = d(financialMonthRangeByMonth(financialMonthForDate(from, financialMonth), financialMonth).to);
  const last = d(to);
  if (count === 1) {
    return dateFormatter(locale, last.getFullYear() === thisYear ? { month: "long" } : { month: "long", year: "numeric" }).format(last);
  }
  const sameYear = firstEnd.getFullYear() === last.getFullYear();
  const short = dateFormatter(locale, { month: "short" });
  const shortYear = dateFormatter(locale, { month: "short", year: "numeric" });
  if (sameYear && last.getFullYear() === thisYear) return `${short.format(firstEnd)} – ${short.format(last)}`;
  return `${(sameYear ? short : shortYear).format(firstEnd)} – ${shortYear.format(last)}`;
}

/** Writes the range to the URL and the shared `date_from`/`date_to` cookie pair. */
function useRangeNavigation(tab: string | undefined) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (r: Range) => {
    setRangeCookie("date_from", r.from);
    setRangeCookie("date_to", r.to);
    const params = new URLSearchParams(searchParams.toString());
    if (tab) params.set("tab", tab);
    params.set("from", r.from);
    params.set("to", r.to);
    router.push(`${pathname}?${params.toString()}`);
  };
}

/**
 * The Insights period picker: the heading pill ("Budget period · October", the period
 * alone on phones) that opens the period panel — presets, stepping, a range calendar
 * and from/to fields, applied together. Whole budget months are named ("Budget periods ·
 * Aug – Oct"); any other range shows its dates. Drives `?from=&to=` plus the
 * `date_from`/`date_to` cookie pair.
 */
export function PeriodSelector({
  from,
  to,
  financialMonth,
  budgetPeriod,
  tab,
}: {
  from: string;
  to: string;
  financialMonth: FinancialMonthConfig;
  /** The active budget's own [from,to], or null without a budget — only then is
   *  "Budget" offered and detected. */
  budgetPeriod: Range | null;
  /** Sets `?tab=` alongside `from`/`to` (the Insights page's tab convention). */
  tab?: string;
}) {
  const t = useTranslations("insights.period");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const navigate = useRangeNavigation(tab);
  const preset = detectPreset(from, to, financialMonth, budgetPeriod);
  const months = budgetMonthCount(from, to, financialMonth);
  // Whole budget months read as the months they are; the fixed presets keep their name.
  const presetLabel =
    preset === "budget" || (months > 0 && (preset === "custom" || preset === "month"))
      ? t("budgetPeriods", { count: Math.max(1, months) })
      : t(`presets.${preset}`);
  const periodLabel = months > 0 ? budgetMonthsLabel(from, to, months, locale, financialMonth) : fmtRange(from, to, locale);

  return (
    <PeriodPanel
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" aria-label={t("triggerLabel", { period: fmtRange(from, to, locale, true) })} className={filterPillClass(open, "shrink-0")}>
          <IconCalendar aria-hidden stroke={1.9} />
          <span className="hidden lg:inline">{presetLabel} · </span>
          <span className="inline-block first-letter:uppercase">{periodLabel}</span>
          <IconChevronDown aria-hidden stroke={2.2} />
        </button>
      }
      from={from}
      to={to}
      financialMonth={financialMonth}
      budgetPeriod={budgetPeriod}
      onApply={(r) => {
        navigate(r);
        setOpen(false);
      }}
    />
  );
}

// ── The period panel ─────────────────────────────────────────────────────────

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function addMonths(first: string, n: number) {
  const d = new Date(`${first}T00:00:00`);
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

/** A popover on desktop (a sheet on phones): preset chips, previous / next, two months
 *  of calendar to pick a range on, and from / to fields. Nothing changes until Apply. */
function PeriodPanel({
  open,
  onOpenChange,
  trigger,
  from,
  to,
  financialMonth,
  budgetPeriod,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactElement<React.ComponentProps<"button">>;
  from: string;
  to: string;
  financialMonth: FinancialMonthConfig;
  budgetPeriod: Range | null;
  onApply: (r: Range) => void;
}) {
  const t = useTranslations("insights.period");
  const locale = useLocale();
  const isDesktop = useIsDesktop();
  const fromInput = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<Range>({ from, to });
  const [pickingEnd, setPickingEnd] = useState(false);
  const [cursor, setCursor] = useState(monthStart(to));

  // Every time the panel opens it starts from the period on screen.
  function handleOpenChange(next: boolean) {
    if (next) {
      setStaged({ from, to });
      setPickingEnd(false);
      setCursor(monthStart(to));
    }
    onOpenChange(next);
  }

  function stage(r: Range) {
    setStaged(r);
    setPickingEnd(false);
    setCursor(monthStart(r.to));
  }

  function pickDay(day: string) {
    if (!pickingEnd) {
      setStaged({ from: day, to: day });
      setPickingEnd(true);
      return;
    }
    setStaged((s) => (day < s.from ? { from: day, to: s.from } : { from: s.from, to: day }));
    setPickingEnd(false);
  }

  const now = today();
  const valid = !!staged.from && !!staged.to && staged.from <= staged.to;
  const stagedPreset = valid ? detectPreset(staged.from, staged.to, financialMonth, budgetPeriod) : "custom";
  const totalDays = valid ? daysInclusive(staged.from, staged.to) : 0;
  const todayInRange = valid && staged.from <= now && now <= staged.to;
  const months = isDesktop ? [addMonths(cursor, -1), cursor] : [cursor];
  const todayLabel = dateFormatter(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-9 cursor-pointer items-center rounded-full px-3.5 text-sm font-bold transition-colors",
      active ? "bg-clear-primary text-clear-primary-ink" : "bg-clear-ground text-clear-ink hover:bg-clear-line",
    );
  const roundButton =
    "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-clear-card text-clear-ink transition-colors hover:bg-clear-line disabled:cursor-not-allowed disabled:text-clear-placeholder";

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={handleOpenChange}
      title={t("title")}
      trigger={trigger}
      className="max-h-[min(780px,var(--available-height))] w-[min(680px,calc(100vw-32px))] rounded-clear-card"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-1">
          <span className="inline-flex items-center gap-2 text-[13px] text-clear-muted">
            <span aria-hidden className="size-2.5 rounded-full ring-2 ring-inset ring-clear-ink" />
            {t("today", { date: todayLabel })}
          </span>
          <div className="flex gap-2.5">
            <button type="button" onClick={() => handleOpenChange(false)} className={clearButtonVariants({ variant: "secondary" })}>
              {t("cancel")}
            </button>
            <button type="button" disabled={!valid} onClick={() => onApply(staged)} className={clearButtonVariants()}>
              {t("apply")}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-[18px] p-1 lg:p-5">
        {isDesktop && (
          <div className="flex items-center gap-3.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h2 className="m-0 text-[22px] font-extrabold tracking-[-0.02em]">{t("title")}</h2>
              {budgetPeriod && <span className="text-sm text-clear-muted">{t("subtitle")}</span>}
            </div>
            <button type="button" onClick={() => handleOpenChange(false)} aria-label={t("close")} className={cn(roundButton, "bg-clear-ground")}>
              <IconX size={20} stroke={2} aria-hidden />
            </button>
          </div>
        )}

        <div role="group" aria-label={t("presetsLabel")} className="flex flex-wrap gap-2">
          {budgetPeriod && (
            <button type="button" aria-pressed={stagedPreset === "budget"} onClick={() => stage(budgetPeriod)} className={chip(stagedPreset === "budget")}>
              {t("presets.budget")}
            </button>
          )}
          {PRESET_OPTIONS.map((p) => (
            <button key={p} type="button" aria-pressed={stagedPreset === p} onClick={() => stage(presetRange(p, financialMonth))} className={chip(stagedPreset === p)}>
              {t(`presets.${p}`)}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={stagedPreset === "custom"}
            onClick={() => {
              setPickingEnd(false);
              fromInput.current?.focus();
            }}
            className={chip(stagedPreset === "custom")}
          >
            {t("presets.custom")}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-clear-tile bg-clear-tile p-2">
          <button
            type="button"
            aria-label={t("previous")}
            disabled={!valid}
            onClick={() => stage(shiftRange(stagedPreset, staged.from, staged.to, -1, financialMonth))}
            className={roundButton}
          >
            <IconChevronLeft size={20} stroke={2} aria-hidden />
          </button>
          <span className="flex min-w-0 flex-col items-center gap-0.5 text-center" aria-live="polite">
            <span className="text-base font-extrabold tracking-[-0.01em] lg:text-lg">{valid ? fmtRange(staged.from, staged.to, locale, true) : "—"}</span>
            {valid && (
              <span className="text-[13px] text-clear-muted">
                {t("days", { count: totalDays })}
                {todayInRange && ` · ${t("dayToday", { day: daysInclusive(staged.from, now) })}`}
              </span>
            )}
          </span>
          <button
            type="button"
            aria-label={t("next")}
            disabled={!valid || staged.to >= now}
            onClick={() => stage(shiftRange(stagedPreset, staged.from, staged.to, 1, financialMonth))}
            className={roundButton}
          >
            <IconChevronRight size={20} stroke={2} aria-hidden />
          </button>
        </div>

        <div className="grid gap-7 sm:grid-cols-2">
          {months.map((m, i) => (
            <MonthGrid
              key={m}
              month={m}
              range={staged}
              today={now}
              onPick={pickDay}
              onPrev={i === 0 ? () => setCursor(addMonths(cursor, -1)) : undefined}
              onNext={i === months.length - 1 ? () => setCursor(addMonths(cursor, 1)) : undefined}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          <ClearField label={t("from")} htmlFor="insights-period-from">
            <ClearInput
              ref={fromInput}
              id="insights-period-from"
              type="date"
              value={staged.from}
              onChange={(e) => e.target.value && setStaged((s) => ({ ...s, from: e.target.value }))}
              aria-invalid={!valid || undefined}
            />
          </ClearField>
          <ClearField label={t("to")} htmlFor="insights-period-to">
            <ClearInput
              id="insights-period-to"
              type="date"
              value={staged.to}
              onChange={(e) => e.target.value && setStaged((s) => ({ ...s, to: e.target.value }))}
              aria-invalid={!valid || undefined}
            />
          </ClearField>
        </div>
      </div>
    </ResponsivePopover>
  );
}

/** One month of the range calendar, weeks starting Monday. */
function MonthGrid({
  month,
  range,
  today,
  onPick,
  onPrev,
  onNext,
}: {
  month: string;
  range: Range;
  today: string;
  onPick: (day: string) => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const t = useTranslations("insights.period");
  const locale = useLocale();
  const first = new Date(`${month}T00:00:00`);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const title = dateFormatter(locale, { month: "long", year: "numeric" }).format(first);
  const weekday = dateFormatter(locale, { weekday: "short" });
  const dayLabel = dateFormatter(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  // 2024-01-01 was a Monday.
  const weekdays = Array.from({ length: 7 }, (_, i) => weekday.format(new Date(2024, 0, 1 + i)));
  const nav = "inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-clear-ink transition-colors hover:bg-clear-tile";

  return (
    <div role="group" aria-label={title} className="flex flex-col gap-2">
      <div className="flex h-8 items-center gap-1">
        {onPrev && (
          <button type="button" onClick={onPrev} aria-label={t("previousMonth")} className={nav}>
            <IconChevronLeft size={16} stroke={2.2} aria-hidden />
          </button>
        )}
        <span className="flex-1 pl-1 text-[15px] font-extrabold first-letter:uppercase">{title}</span>
        {onNext && (
          <button type="button" onClick={onNext} aria-label={t("nextMonth")} className={nav}>
            <IconChevronRight size={16} stroke={2.2} aria-hidden />
          </button>
        )}
      </div>
      <div aria-hidden className="grid grid-cols-7 text-center text-xs font-bold text-clear-muted">
        {weekdays.map((w, i) => (
          <span key={i}>{w.slice(0, 2)}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: offset }).map((_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = `${month.slice(0, 8)}${String(i + 1).padStart(2, "0")}`;
          const col = (offset + i) % 7;
          const isStart = day === range.from;
          const isEnd = day === range.to;
          const inRange = day >= range.from && day <= range.to;
          const isToday = day === today;
          // The peach strip joins the days in the range, rounding off at week edges; on
          // the first and last day it only runs from the middle of the cell inwards.
          const strip = inRange && range.from !== range.to;
          const middle = strip && !isStart && !isEnd;
          return (
            <div
              key={day}
              className={cn(
                "flex h-10 items-center justify-center",
                middle && "bg-clear-peach",
                middle && (col === 0 || i === 0) && "rounded-l-full",
                middle && (col === 6 || i === daysInMonth - 1) && "rounded-r-full",
                strip && isStart && col !== 6 && "bg-[linear-gradient(90deg,transparent_50%,var(--clr-peach)_50%)]",
                strip && isEnd && col !== 0 && "bg-[linear-gradient(90deg,var(--clr-peach)_50%,transparent_50%)]",
              )}
            >
              <button
                type="button"
                onClick={() => onPick(day)}
                aria-label={dayLabel.format(new Date(`${day}T00:00:00`))}
                aria-pressed={isStart || isEnd}
                className={cn(
                  "size-10 cursor-pointer rounded-full text-sm tabular-nums transition-colors",
                  isStart || isEnd
                    ? "bg-clear-ember font-extrabold text-clear-ember-ink"
                    : inRange
                      ? "font-semibold text-clear-ink hover:bg-clear-card"
                      : "font-medium text-clear-muted hover:bg-clear-tile",
                  isToday && "font-extrabold ring-2 ring-inset ring-clear-ink",
                )}
              >
                {i + 1}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

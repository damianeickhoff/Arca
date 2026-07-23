"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePicker } from "@/components/date-picker";
import { cn } from "@/lib/utils";
import {
  financialMonthRange,
  financialMonthRangeByMonth,
  financialMonthForDate,
  offsetFinancialMonth,
  shiftDate,
  type FinancialMonthConfig,
} from "@/lib/date-range";

type Preset = "budget" | "week" | "month" | "3m" | "6m" | "year" | "custom";

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateStr(d);
}

function endOfWeek(date = new Date()) {
  const start = new Date(`${startOfWeek(date)}T00:00:00`);
  start.setDate(start.getDate() + 6);
  return toDateStr(start);
}

function setRangeCookie(name: "date_from" | "date_to", value: string) {
  document.cookie = `${name}=${value};path=/;max-age=31536000;SameSite=Lax`;
}

function spanDays(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000) + 1;
}

const PRESET_OPTIONS: { value: Exclude<Preset, "custom" | "budget">; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "year", label: "Year" },
];

const PRESET_LABEL: Record<Preset, string> = {
  budget: "Budget",
  week: "Week",
  month: "Month",
  "3m": "Last 3 months",
  "6m": "Last 6 months",
  year: "Year",
  custom: "Custom",
};

/** [from,to] for every preset except "custom" — anchored to *today*, same as the
 * initial "Last 3 months"/"Last 6 months" always end at the current month. Used
 * both to compute a freshly-picked preset's range and to detect which preset (if
 * any) the current [from,to] matches, so the trigger/popup can highlight it. */
function presetRange(preset: Exclude<Preset, "custom" | "budget">, financialMonth: FinancialMonthConfig): { from: string; to: string } {
  const year = new Date().getFullYear();
  switch (preset) {
    case "week":
      return { from: startOfWeek(), to: endOfWeek() };
    case "month":
      return calendarMonthRange(toDateStr(new Date()));
    case "3m":
      return { from: financialMonthRange(financialMonth, -2).from, to: financialMonthRange(financialMonth, 0).to };
    case "6m":
      return { from: financialMonthRange(financialMonth, -5).from, to: financialMonthRange(financialMonth, 0).to };
    case "year":
      return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
}

function isWeekSpan(from: string, to: string): boolean {
  const dow = new Date(`${from}T00:00:00`).getDay(); // 0=Sunday..6=Saturday
  return dow === 1 && shiftDate(from, 6) === to;
}

function isFinancialMonthSpan(from: string, to: string, financialMonth: FinancialMonthConfig): boolean {
  const r = financialMonthRangeByMonth(financialMonthForDate(from, financialMonth), financialMonth);
  return r.from === from && r.to === to;
}

/** [from,to] for the calendar month `from` falls in — plain 1st-to-last-day,
 * independent of the configured financial-month start day. "Month" is a
 * calendar concept; only "Budget" (see isFinancialMonthSpan) follows the
 * financial-month config. */
function calendarMonthRange(from: string): { from: string; to: string } {
  const d = new Date(`${from}T00:00:00`);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: toDateStr(first), to: toDateStr(last) };
}

function isCalendarMonthSpan(from: string, to: string): boolean {
  const d = new Date(`${from}T00:00:00`);
  if (d.getDate() !== 1) return false;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return toDateStr(last) === to;
}

/** Shifts a calendar-month [from,to] by whole calendar months. */
function shiftCalendarMonths(from: string, months: number): { from: string; to: string } {
  const d = new Date(`${from}T00:00:00`);
  const shifted = new Date(d.getFullYear(), d.getMonth() + months, 1);
  return calendarMonthRange(toDateStr(shifted));
}

/** Whether [from,to] is a `months`-long rolling window of consecutive financial
 * months ending exactly at `to` — checked by working backward from `to`'s own
 * month rather than forward from `from`, since a rolling window is defined by
 * "the last N months up to this one." */
function isRollingMonthsSpan(from: string, to: string, months: number, financialMonth: FinancialMonthConfig): boolean {
  const toMonth = financialMonthForDate(to, financialMonth);
  const toRange = financialMonthRangeByMonth(toMonth, financialMonth);
  if (toRange.to !== to) return false;
  const fromMonth = offsetFinancialMonth(toMonth, -(months - 1));
  return financialMonthRangeByMonth(fromMonth, financialMonth).from === from;
}

function isYearSpan(from: string, to: string): boolean {
  return /^\d{4}-01-01$/.test(from) && /^\d{4}-12-31$/.test(to) && from.slice(0, 4) === to.slice(0, 4);
}

/** Classifies [from,to] by *shape* (a Mon–Sun span, a single financial month, a
 * rolling 3/6-month window, a calendar year) rather than by matching "today's"
 * instance of each preset — so stepping to last week still reads as "Week", not
 * "Custom", with only the date range underneath changing. "Budget" only matches
 * the budget's exact live period; step away from it and it falls through to
 * whichever shape (week/month) it structurally is. */
function detectPreset(from: string, to: string, financialMonth: FinancialMonthConfig, budgetPeriod: { from: string; to: string } | null): Preset {
  if (budgetPeriod && from === budgetPeriod.from && to === budgetPeriod.to) return "budget";
  if (isWeekSpan(from, to)) return "week";
  if (isCalendarMonthSpan(from, to)) return "month";
  if (isRollingMonthsSpan(from, to, 3, financialMonth)) return "3m";
  if (isRollingMonthsSpan(from, to, 6, financialMonth)) return "6m";
  if (isYearSpan(from, to)) return "year";
  return "custom";
}

/** Shifts [from,to] by whole financial months — used for "month" (±1) and the
 * rolling "Last 3/6 months" windows (±3/±6) — by moving each boundary's own
 * financial-month index rather than recomputing from today, so repeated
 * next/prev taps walk steadily through history instead of snapping back. */
function shiftByMonths(from: string, to: string, months: number, financialMonth: FinancialMonthConfig) {
  const fromMonth = financialMonthForDate(from, financialMonth);
  const toMonth = financialMonthForDate(to, financialMonth);
  return {
    from: financialMonthRangeByMonth(offsetFinancialMonth(fromMonth, months), financialMonth).from,
    to: financialMonthRangeByMonth(offsetFinancialMonth(toMonth, months), financialMonth).to,
  };
}

function shiftRange(preset: Preset, from: string, to: string, direction: 1 | -1, financialMonth: FinancialMonthConfig): { from: string; to: string } {
  switch (preset) {
    case "budget": {
      // The live budget period is structurally a week or a month span (weekly vs
      // monthly budget) — step it the same way, then let detectPreset reclassify
      // the result as "Week"/"Month" once it no longer matches the live period.
      if (isWeekSpan(from, to)) return { from: shiftDate(from, 7 * direction), to: shiftDate(to, 7 * direction) };
      if (isFinancialMonthSpan(from, to, financialMonth)) return shiftByMonths(from, to, direction, financialMonth);
      const budgetDays = spanDays(from, to);
      return { from: shiftDate(from, budgetDays * direction), to: shiftDate(to, budgetDays * direction) };
    }
    case "week":
      return { from: shiftDate(from, 7 * direction), to: shiftDate(to, 7 * direction) };
    case "month":
      return shiftCalendarMonths(from, direction);
    case "3m":
      return shiftByMonths(from, to, 3 * direction, financialMonth);
    case "6m":
      return shiftByMonths(from, to, 6 * direction, financialMonth);
    case "year": {
      const fy = Number(from.slice(0, 4)) + direction;
      const ty = Number(to.slice(0, 4)) + direction;
      return { from: `${fy}-01-01`, to: `${ty}-12-31` };
    }
    case "custom": {
      const days = spanDays(from, to);
      return { from: shiftDate(from, days * direction), to: shiftDate(to, days * direction) };
    }
  }
}

function fmtRange(from: string, to: string) {
  const f = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${f(from)} – ${f(to)}`;
}

/** Period picker for the Analytics tab — defaults to the configured budget period
 * (set server-side, before this ever mounts) and otherwise behaves like the
 * category detail page's period picker, plus prev/next stepping that can't move
 * past the period containing today. Drives the same `?from=&to=` + cookie pair
 * as the page's own DateRangePicker, so the two stay in sync. */
export function PeriodSelector({
  from,
  to,
  financialMonth,
  budgetPeriod,
  tab,
  embedded = false,
}: {
  from: string;
  to: string;
  financialMonth: FinancialMonthConfig;
  /** The active budget's own [from,to], or null when no budget is configured —
   * only then is "Budget" offered/detected as a period. */
  budgetPeriod: { from: string; to: string } | null;
  /** Sets `?tab=` alongside `from`/`to` — only relevant for the Reports page's
   * own tab-switching URL convention. Omit on standalone pages (e.g. /trends). */
  tab?: string;
  /** True when rendered inside the dashboard's Reports portal instead of the
   * standalone /reports or /trends page. The portal's tab content is sourced
   * purely from the `date_from`/`date_to` cookie (see reports-portal-content.tsx),
   * never from the URL — but the portal shares the dashboard's own "/" route,
   * which DOES read `from`/`to` query params for its own unrelated wallet-balance
   * date range. Pushing `from`/`to` here would corrupt that (and, since it also
   * used to overwrite the whole query string, wipe out sibling tabs' own state
   * like Prognose's `month`). Embedded mode only sets the cookie and refreshes
   * the current route instead of touching the URL at all. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  const preset = detectPreset(from, to, financialMonth, budgetPeriod);
  const canGoNext = to < toDateStr(new Date());

  function navigate(f: string, t: string) {
    setRangeCookie("date_from", f);
    setRangeCookie("date_to", t);
    if (embedded) {
      router.refresh();
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (tab) params.set("tab", tab);
    params.set("from", f);
    params.set("to", t);
    router.push(`${pathname}?${params.toString()}`);
  }

  function pick(p: Exclude<Preset, "custom" | "budget">) {
    const r = presetRange(p, financialMonth);
    navigate(r.from, r.to);
    setOpen(false);
    setShowCustom(false);
  }

  function pickBudget() {
    if (!budgetPeriod) return;
    navigate(budgetPeriod.from, budgetPeriod.to);
    setOpen(false);
    setShowCustom(false);
  }

  function applyCustom() {
    if (!customFrom || !customTo || customFrom > customTo) return;
    navigate(customFrom, customTo);
    setOpen(false);
    setShowCustom(false);
  }

  function step(direction: 1 | -1) {
    if (direction === 1 && !canGoNext) return;
    const r = shiftRange(preset, from, to, direction, financialMonth);
    navigate(r.from, r.to);
  }

  return (
    <>
      {/* Fixed at the same position + height as the mobile bottom nav
          (mobile-bottom-nav.tsx: left-6/right-6/bottom-5, 3.75rem/60px tall),
          so it reads as another bar in the same stack instead of a bigger,
          differently-placed control. */}
      <div className="lg:hidden fixed left-6 right-6 bottom-5 z-40 h-[3.75rem] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous period"
          className="h-full aspect-square rounded-full bg-black/7 dark:bg-white/7 backdrop-blur-lg flex items-center justify-center active:scale-95 transition-transform shrink-0"
        >
          <IconChevronLeft className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-1 min-w-0 h-full rounded-full bg-black/7 dark:bg-white/7 backdrop-blur-lg px-4 flex flex-col items-center justify-center active:scale-[0.98] transition-transform"
        >
          <p className="text-[11px] leading-tight text-foreground/50">{PRESET_LABEL[preset]}</p>
          <p className="text-sm font-semibold leading-tight truncate">{fmtRange(from, to)}</p>
        </button>

        <button
          type="button"
          onClick={() => step(1)}
          disabled={!canGoNext}
          aria-label="Next period"
          className="h-full aspect-square rounded-full bg-black/7 dark:bg-white/7 backdrop-blur-lg flex items-center justify-center active:scale-95 transition-transform shrink-0 disabled:cursor-not-allowed"
        >
          <IconChevronRight className={cn("size-4", !canGoNext && "opacity-30")} />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Period</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-1 -mx-1">
            {budgetPeriod && (
              <button
                type="button"
                onClick={pickBudget}
                className={cn(
                  "w-full text-left text-sm px-4 py-3.5 rounded-xl transition-colors",
                  preset === "budget" ? "bg-foreground text-primary-foreground font-medium" : "hover:bg-foreground/5 text-foreground",
                )}
              >
                Budget period
              </button>
            )}
            {PRESET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => pick(opt.value)}
                className={cn(
                  "w-full text-left text-sm px-4 py-3.5 rounded-xl transition-colors",
                  preset === opt.value ? "bg-foreground text-primary-foreground font-medium" : "hover:bg-foreground/5 text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowCustom((v) => !v)}
              className={cn(
                "w-full text-left text-sm px-4 py-3.5 rounded-xl transition-colors",
                preset === "custom" ? "bg-foreground text-primary-foreground font-medium" : "hover:bg-foreground/5 text-foreground",
              )}
            >
              Custom
            </button>
          </div>

          {showCustom && (
            <div className="pt-3 border-t border-foreground/10 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-foreground/60 px-1">From</label>
                  <DatePicker value={customFrom} onChange={setCustomFrom} triggerClassName="h-10 text-xs mt-0 mb-0" />
                </div>
                <div>
                  <label className="text-xs text-foreground/60">To</label>
                  <DatePicker value={customTo} onChange={setCustomTo} triggerClassName="h-10 text-xs mt-0 mb-0" />
                </div>
              </div>
              <button
                type="button"
                onClick={applyCustom}
                disabled={!customFrom || !customTo || customFrom > customTo}
                className="w-full h-12 text-sm rounded-xl bg-foreground text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                Apply
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

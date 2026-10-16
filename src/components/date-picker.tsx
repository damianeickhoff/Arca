"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Popover } from "@base-ui/react/popover";
import { IconCalendar, IconChevronDown, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { ContextualTip } from "@/components/contextual-tip";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { cn } from "@/lib/utils";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toMonthStr(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function parseDateStr(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  if (!y) return new Date();
  return new Date(y, (m || 1) - 1, d || 1);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Days between today and `date`: 0 today, -1 yesterday, 1 tomorrow. */
function dayOffset(date: Date, now = new Date()) {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

/** 6 weeks (42 days) starting from the Monday on/before the 1st of `monthCursor`'s month. */
function buildDayGrid(monthCursor: Date) {
  const firstOfMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const weekday = firstOfMonth.getDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  return Array.from({ length: 42 }, (_, i) => addDays(firstOfMonth, i - offset));
}

/** Moves focus by `delta` among the buttons of a month or year grid. */
function moveInGrid(e: React.KeyboardEvent<HTMLElement>, columns: number) {
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[e.key];
  if (delta == null) return;
  const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = buttons[Math.min(buttons.length - 1, Math.max(0, (index < 0 ? 0 : index) + delta))];
  if (!next) return;
  e.preventDefault();
  next.focus();
}

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  /** "day" (default) picks a full date ("YYYY-MM-DD"); "month" picks just a month ("YYYY-MM"). */
  granularity?: "day" | "month";
  /** Override the trigger button's classes — useful in compact/dense layouts. */
  triggerClassName?: string;
  /** Override the text shown on the trigger. Falls back to the full date ("Wed 14 Oct
   *  2026", plus a Today/Yesterday/Tomorrow chip) or, for months, "October 2026". */
  label?: string;
  /** Shown as the trigger label when `value` is empty — for optional dates. */
  placeholder?: string;
  /** When provided (alongside an empty-able `value`), adds a "Clear" action to the
   *  calendar, resetting the date to "not set". */
  onClear?: () => void;
  /** Restyles the trigger + calendar for a forced-dark surface — see CalendarContent's
   *  `dark` prop for why. */
  dark?: boolean;
}

/**
 * The calendar itself (Popup-DatePicker): optional quick picks, a month header with
 * round prev/next buttons, the day grid (today ringed in ember, the selection black),
 * and a footer with the today legend and Clear. Tapping the month name drills up to a
 * month grid, then a year grid. Arrow keys move the focused day (Page Up/Down a month,
 * Home/End the week), Enter or Space picks it.
 */
export function CalendarContent({
  value,
  onChange,
  granularity,
  cursor,
  setCursor,
  onClose,
  onClear,
  dark,
  quickPicks = false,
  autoFocusDay = false,
}: {
  value: string;
  onChange: (date: string) => void;
  granularity: "day" | "month";
  cursor: Date;
  setCursor: (d: Date) => void;
  onClose: () => void;
  /** When provided, a "Clear" action shows in the footer — for optional dates (e.g. a
   *  goal's end date) that need a way back to "not set". */
  onClear?: () => void;
  /** Swaps the theme tokens for white-on-dark — for callers that render this on a
   *  forced-dark surface (the onboarding wizard's gradient) where theme tokens would go
   *  invisible in light mode. */
  dark?: boolean;
  /** Today · Yesterday · 2 days ago (or This month · Last month) above the calendar. */
  quickPicks?: boolean;
  /** Focus the selected (or today's) day on mount, for keyboard use on desktop. */
  autoFocusDay?: boolean;
}) {
  const t = useTranslations("datePicker");
  const locale = useLocale();
  const c = dark
    ? {
        text: "text-white",
        muted: "text-white/55",
        faded: "text-white/30",
        hoverBg: "hover:bg-white/10",
        roundBtn: "bg-white/10 text-white hover:bg-white/15",
        pill: "bg-white/10 text-white hover:bg-white/15",
        selectedBg: "bg-white text-[#0a1a5c]",
        todayRing: "ring-2 ring-inset ring-white/60",
        line: "border-white/15",
      }
    : {
        text: "text-clear-ink",
        muted: "text-clear-muted",
        faded: "text-clear-placeholder",
        hoverBg: "hover:bg-clear-tile",
        roundBtn: "bg-clear-ground text-clear-ink hover:bg-clear-line",
        pill: "bg-clear-ground text-clear-ink hover:bg-clear-line",
        selectedBg: "bg-clear-primary text-clear-primary-ink",
        todayRing: "ring-2 ring-inset ring-clear-ember",
        line: "border-clear-ground",
      };
  const today = new Date();
  const todayStr = toDateStr(today);
  const todayMonthStr = toMonthStr(today);

  // Drill-down: day granularity starts on the day grid, tapping the header goes up
  // to a month grid, then up again to a year grid; month granularity starts on the
  // month grid (its own terminal view) and can only drill up to the year grid.
  const [view, setView] = useState<"day" | "month" | "year">(granularity === "month" ? "month" : "day");
  const isTerminalView = granularity === "month" ? view === "month" : view === "day";

  // The day the arrow keys move: the selection when it's in view, else today.
  const [focusDay, setFocusDay] = useState(() => {
    if (value && value.length === 10) return value;
    return todayStr;
  });
  const shownFocusDay =
    parseDateStr(focusDay).getMonth() === cursor.getMonth() && parseDateStr(focusDay).getFullYear() === cursor.getFullYear()
      ? focusDay
      : toDateStr(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const gridRef = useRef<HTMLDivElement>(null);
  const focusAfterRender = useRef(autoFocusDay);

  useEffect(() => {
    if (!focusAfterRender.current) return;
    focusAfterRender.current = false;
    gridRef.current?.querySelector<HTMLElement>("[data-calendar-focus]")?.focus();
  });

  function pickDate(date: Date) {
    onChange(toDateStr(date));
    onClose();
  }

  function pickMonth(date: Date) {
    if (granularity === "month") {
      onChange(toMonthStr(date));
      onClose();
    } else {
      setCursor(date);
      setView("day");
    }
  }

  function pickYear(year: number) {
    setCursor(new Date(year, cursor.getMonth(), 1));
    setView("month");
  }

  function shift(delta: number) {
    if (view === "year") setCursor(new Date(cursor.getFullYear() + delta * 12, cursor.getMonth(), 1));
    else if (view === "month") setCursor(new Date(cursor.getFullYear() + delta, cursor.getMonth(), 1));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  function onDayKey(e: React.KeyboardEvent) {
    const from = parseDateStr(shownFocusDay);
    const weekday = (from.getDay() + 6) % 7;
    const next = (() => {
      switch (e.key) {
        case "ArrowLeft": return addDays(from, -1);
        case "ArrowRight": return addDays(from, 1);
        case "ArrowUp": return addDays(from, -7);
        case "ArrowDown": return addDays(from, 7);
        case "Home": return addDays(from, -weekday);
        case "End": return addDays(from, 6 - weekday);
        case "PageUp": return new Date(from.getFullYear(), from.getMonth() - 1, Math.min(from.getDate(), 28));
        case "PageDown": return new Date(from.getFullYear(), from.getMonth() + 1, Math.min(from.getDate(), 28));
        default: return null;
      }
    })();
    if (!next) return;
    e.preventDefault();
    setFocusDay(toDateStr(next));
    if (next.getMonth() !== cursor.getMonth() || next.getFullYear() !== cursor.getFullYear()) {
      setCursor(new Date(next.getFullYear(), next.getMonth(), 1));
    }
    focusAfterRender.current = true;
  }

  const yearBlockStart = cursor.getFullYear() - 5;
  const years = Array.from({ length: 12 }, (_, i) => yearBlockStart + i);
  const monthTitle = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  const monthShort = new Intl.DateTimeFormat(locale, { month: "short" });
  const fullDay = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  // Monday-first two-letter weekday heads: 2024-01-01 was a Monday.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 0, 1 + i)).slice(0, 2),
  );

  const prevLabel = view === "year" ? t("previousYears") : view === "month" ? t("previousYear") : t("previousMonth");
  const nextLabel = view === "year" ? t("nextYears") : view === "month" ? t("nextYear") : t("nextMonth");

  const roundBtn = cn("flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50", c.roundBtn);
  const cellFocus = "outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50";

  const picks =
    granularity === "month"
      ? [
          { label: t("thisMonth"), date: today, active: value === todayMonthStr },
          { label: t("lastMonth"), date: new Date(today.getFullYear(), today.getMonth() - 1, 1), active: value === toMonthStr(new Date(today.getFullYear(), today.getMonth() - 1, 1)) },
        ]
      : [0, -1, -2].map((offset) => {
          const date = addDays(today, offset);
          return { label: offset === 0 ? t("today") : offset === -1 ? t("yesterday") : t("daysAgo", { count: -offset }), date, active: value === toDateStr(date) };
        });

  return (
    <div className={cn("flex flex-col gap-3 font-clear", c.text)}>
      {quickPicks && isTerminalView && (
        <div role="group" aria-label={t("quickPicks")} className="flex gap-1.5">
          {picks.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={p.active}
              onClick={() => (granularity === "month" ? pickMonth(p.date) : pickDate(p.date))}
              className={cn(
                "h-[34px] flex-1 cursor-pointer rounded-full px-2.5 text-[13px] font-bold whitespace-nowrap transition-colors",
                cellFocus,
                p.active ? c.selectedBg : c.pill,
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className={cn("flex items-center justify-between gap-2", quickPicks && isTerminalView && cn("border-t pt-3", c.line))}>
        <button type="button" onClick={() => shift(-1)} aria-label={prevLabel} className={roundBtn}>
          <IconChevronLeft className="size-[18px]" stroke={2.2} />
        </button>
        {view === "year" ? (
          <p aria-live="polite" className="m-0 text-[15px] font-extrabold tabular-nums">
            {years[0]}–{years[years.length - 1]}
          </p>
        ) : (
          <button
            type="button"
            aria-live="polite"
            onClick={() => setView(view === "day" ? "month" : "year")}
            aria-label={view === "day" ? t("chooseMonthOf", { month: monthTitle.format(cursor) }) : t("chooseYearOf", { year: cursor.getFullYear() })}
            className={cn("cursor-pointer rounded-full px-3 py-1.5 text-[15px] font-extrabold capitalize transition-colors", cellFocus, c.hoverBg)}
          >
            {view === "month" ? cursor.getFullYear() : monthTitle.format(cursor)}
          </button>
        )}
        <button type="button" onClick={() => shift(1)} aria-label={nextLabel} className={roundBtn}>
          <IconChevronRight className="size-[18px]" stroke={2.2} />
        </button>
      </div>

      {view === "year" ? (
        <div className="grid grid-cols-3 gap-1.5" onKeyDown={(e) => moveInGrid(e, 3)}>
          {years.map((year) => {
            const isCursorYear = year === cursor.getFullYear();
            const isCurrent = year === today.getFullYear();
            return (
              <button
                key={year}
                type="button"
                aria-pressed={isCursorYear}
                onClick={() => pickYear(year)}
                className={cn(
                  "cursor-pointer rounded-full py-3 text-sm font-bold tabular-nums transition-colors",
                  cellFocus,
                  isCursorYear ? c.selectedBg : c.hoverBg,
                  !isCursorYear && isCurrent && c.todayRing,
                )}
              >
                {year}
              </button>
            );
          })}
        </div>
      ) : view === "month" ? (
        <div className="grid grid-cols-3 gap-1.5" onKeyDown={(e) => moveInGrid(e, 3)}>
          {Array.from({ length: 12 }, (_, i) => {
            const date = new Date(cursor.getFullYear(), i, 1);
            const monthStr = toMonthStr(date);
            const isSelected = granularity === "month" && monthStr === value;
            const isCurrent = monthStr === todayMonthStr;
            return (
              <button
                key={i}
                type="button"
                aria-pressed={isSelected}
                aria-label={monthTitle.format(date)}
                onClick={() => pickMonth(date)}
                className={cn(
                  "cursor-pointer rounded-full py-3 text-sm font-bold capitalize transition-colors",
                  cellFocus,
                  isSelected ? c.selectedBg : c.hoverBg,
                  !isSelected && isCurrent && c.todayRing,
                )}
              >
                {monthShort.format(date).replace(".", "")}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div aria-hidden className={cn("grid h-5 grid-cols-7 items-center text-center text-xs font-bold capitalize", c.muted)}>
            {weekdays.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div ref={gridRef} role="group" aria-label={monthTitle.format(cursor)} className="grid grid-cols-7 justify-items-center gap-y-0.5" onKeyDown={onDayKey}>
            {buildDayGrid(cursor).map((date) => {
              const dateStr = toDateStr(date);
              const inMonth = date.getMonth() === cursor.getMonth();
              const isSelected = dateStr === value;
              const isToday = dateStr === todayStr;
              const isFocus = dateStr === shownFocusDay;
              return (
                <button
                  key={dateStr}
                  type="button"
                  tabIndex={isFocus ? 0 : -1}
                  data-calendar-focus={isFocus ? "" : undefined}
                  aria-label={fullDay.format(date)}
                  aria-pressed={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  onClick={() => pickDate(date)}
                  onFocus={() => dateStr !== focusDay && setFocusDay(dateStr)}
                  className={cn(
                    "flex size-10 cursor-pointer items-center justify-center rounded-full text-sm tabular-nums transition-colors",
                    cellFocus,
                    isSelected ? cn(c.selectedBg, "font-extrabold") : cn(c.hoverBg, isToday ? "font-extrabold" : inMonth ? "font-semibold" : cn("font-medium", c.faded)),
                    !isSelected && isToday && c.todayRing,
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isTerminalView && (
        <div className={cn("flex items-center justify-between gap-2.5 border-t pt-2.5 text-xs font-semibold", c.line, c.muted)}>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2.5 rounded-full", c.todayRing)} />
            {granularity === "month" ? t("thisMonth") : t("today")}
          </span>
          {onClear ? (
            <button
              type="button"
              onClick={() => {
                onClear();
                onClose();
              }}
              className={cn("cursor-pointer rounded-full px-2.5 py-1 text-[13px] font-bold transition-colors", cellFocus, c.text, c.hoverBg)}
            >
              {t("clear")}
            </button>
          ) : (
            <span className="hidden lg:inline">{t("escToClose")}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The date field (Popup-DatePicker): a 48px field showing the full date and a
 * Today/Yesterday/Tomorrow chip; it opens the calendar as a popover anchored to it on
 * desktop, and as a bottom sheet on phones. Inside an open sheet (the forms are
 * sheets) it opens as a small sheet on top instead — a popover portalled out of a
 * Radix-trapped sheet can't take focus or clicks.
 */
export function DatePicker({ value, onChange, granularity = "day", triggerClassName, label, placeholder, onClear, dark }: DatePickerProps) {
  const t = useTranslations("datePicker");
  const locale = useLocale();
  const isDesktop = useIsDesktop();
  const selected = parseDateStr(value);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [asPopover, setAsPopover] = useState(false);
  const [cursor, setCursor] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));

  // Reset the visible month to the selected date's month each time it opens, so
  // reopening never resumes wherever the user had browsed to last time.
  function openPicker() {
    setAsPopover(isDesktop && !triggerRef.current?.closest("[data-vaul-drawer]"));
    setCursor(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setOpen(true);
  }

  const offset = value && granularity === "day" ? dayOffset(selected) : null;
  const relative = offset === 0 ? t("today") : offset === -1 ? t("yesterday") : offset === 1 ? t("tomorrow") : null;

  const triggerLabel =
    label ??
    (!value && placeholder
      ? placeholder
      : granularity === "month"
        ? selected.toLocaleDateString(locale, { month: "long", year: "numeric" })
        : selected.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" }));

  const title = granularity === "month" ? t("chooseMonth") : t("chooseDate");

  const calendar = (inPopover: boolean) => (
    <CalendarContent
      value={value}
      onChange={onChange}
      granularity={granularity}
      cursor={cursor}
      setCursor={setCursor}
      onClose={() => setOpen(false)}
      onClear={onClear}
      dark={dark}
      quickPicks
      autoFocusDay={inPopover || isDesktop}
    />
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-open={open ? "" : undefined}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={cn(
          "flex h-12 w-full cursor-pointer items-center gap-2.5 rounded-clear-row border-[1.5px] border-transparent px-3.5 text-left font-clear text-[15px] font-bold outline-none transition-[background-color,border-color,box-shadow]",
          dark
            ? "bg-white/7 text-white focus-visible:border-white/40 data-open:border-white/40"
            : "bg-clear-tile text-clear-ink focus-visible:border-clear-ember focus-visible:bg-clear-card focus-visible:ring-4 focus-visible:ring-clear-ember/20 data-open:border-clear-ember data-open:bg-clear-card data-open:ring-4 data-open:ring-clear-ember/20",
          !value && placeholder && !label && (dark ? "text-white/50" : "text-clear-muted"),
          triggerClassName,
        )}
      >
        <IconCalendar className="size-[18px] shrink-0" stroke={2} />
        <span className="min-w-0 flex-1 truncate leading-none">{triggerLabel}</span>
        {!label && relative && (
          <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-bold", dark ? "bg-white/10 text-white/80" : "bg-clear-ground text-clear-ink-2")}>
            {relative}
          </span>
        )}
        <IconChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} stroke={2} />
      </button>

      {/* Desktop, outside a sheet: a popover under the field. */}
      <Popover.Root
        open={open && asPopover}
        onOpenChange={(next, details) => {
          if (next) return;
          const target = details.event?.target;
          // The field toggles it itself; a tip card on top doesn't count as outside.
          if (details.reason === "outside-press" && target instanceof Element && (triggerRef.current?.contains(target) || target.closest("[data-dialog-keep-open]"))) {
            details.cancel();
            return;
          }
          setOpen(false);
        }}
      >
        <Popover.Portal>
          <Popover.Positioner anchor={triggerRef} side="bottom" align="start" sideOffset={10} className="isolate z-[200] outline-none">
            <Popover.Popup
              aria-label={title}
              initialFocus={() => document.querySelector<HTMLElement>("[data-calendar-popover] [data-calendar-focus]") ?? true}
              data-calendar-popover=""
              className={cn(
                "w-[340px] origin-(--transform-origin) rounded-[20px] p-4 shadow-clear-dialog outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
                dark ? "border border-white/10 bg-[#0f1533]/95 backdrop-blur-xl" : "bg-clear-card",
              )}
            >
              {calendar(true)}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      {/* Phones, and inside a sheet: a sheet of its own (a centred modal from lg). */}
      <Dialog open={open && !asPopover} onOpenChange={setOpen}>
        <DialogContent
          hideHeaderRow
          title={title}
          sheetClassName={cn("lg:max-w-[400px]", dark && "bg-[#0f1533]/95 backdrop-blur-xl text-white border border-white/10")}
          className="gap-4 pt-6 font-clear"
        >
          <ClearDialogHeader title={title} onClose={() => setOpen(false)} closeLabel={t("close")} />
          {calendar(false)}
        </DialogContent>
      </Dialog>

      {/* The quick picks are new; they announce themselves once. */}
      <ContextualTip id="dateQuickPicks" active={open} />
    </>
  );
}

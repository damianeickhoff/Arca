"use client";

import { useState } from "react";
import {
  IconCalendarFilled as CalendarIcon,
  IconChevronLeft as ChevronLeft,
  IconChevronRightFilled as ChevronRight
} from "@tabler/icons-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MONTH_NAMES } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-is-mobile";

const WEEKDAYS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

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

/** "Today"/"Tomorrow"/"Yesterday" for those offsets; otherwise "d MMM", dropping the
 * year when it matches the current year (only ever shown for `granularity="day"`). */
function smartDayLabel(selected: Date, now = new Date()) {
  const diffDays = Math.round((startOfDay(selected).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  const sameYear = selected.getFullYear() === now.getFullYear();
  return selected.toLocaleDateString("en-GB", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

/** 6 weeks (42 days) starting from the Monday on/before the 1st of `monthCursor`'s month. */
function buildDayGrid(monthCursor: Date) {
  const firstOfMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const weekday = firstOfMonth.getDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - offset);

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(date.getDate() + i);
    return date;
  });
}

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  /** "day" (default) picks a full date ("YYYY-MM-DD"); "month" picks just a month ("YYYY-MM"). */
  granularity?: "day" | "month";
  /** Override the trigger button's classes — useful in compact/dense layouts. */
  triggerClassName?: string;
  /** Override the text shown on the trigger. Falls back to the smart default (day
   *  granularity: "Today"/"Tomorrow"/"Yesterday", else "d MMM" — "d MMM yyyy" only
   *  outside the current year; month granularity: "MMMM yyyy"). */
  label?: string;
  /** Shown as the trigger label when `value` is empty — for optional dates. */
  placeholder?: string;
  /** When provided (alongside an empty-able `value`), adds a "Clear" quick-action to
   *  the calendar popover/sheet, resetting the date to "not set". */
  onClear?: () => void;
  /** Restyles the trigger + calendar popover/sheet for a forced-dark surface — see
   *  CalendarContent's `dark` prop for why. */
  dark?: boolean;
}

export function CalendarContent({
  value,
  onChange,
  granularity,
  cursor,
  setCursor,
  onClose,
  onClear,
  dark,
}: {
  value: string;
  onChange: (date: string) => void;
  granularity: "day" | "month";
  cursor: Date;
  setCursor: (d: Date) => void;
  onClose: () => void;
  /** When provided, an extra "Clear" quick-action shows alongside "Today"/"This month" —
   *  for optional dates (e.g. a goal's end date) that need a way back to "not set". */
  onClear?: () => void;
  /** Swaps the theme-token colors (text-foreground, bg-foreground/5, ...) for hardcoded
   *  white-on-dark ones — for callers that render this on a forced-dark surface (e.g. the
   *  onboarding wizard's auth-gradient background) where theme tokens would go invisible
   *  in light mode. */
  dark?: boolean;
}) {
  const c = dark
    ? {
        text: "text-white",
        hoverBg: "hover:bg-white/10",
        selectedBg: "bg-white text-[#0a1a5c]",
        ring: "ring-1 ring-white/30",
        faded: "text-white/25",
        muted: "text-white/40",
        border: "border-white/15",
      }
    : {
        text: "text-foreground",
        hoverBg: "hover:bg-foreground/5",
        selectedBg: "bg-foreground text-primary-foreground",
        ring: "ring-1 ring-foreground/30",
        faded: "text-foreground/25",
        muted: "text-foreground/40",
        border: "border-border/60",
      };
  const today = new Date();
  const todayStr = toDateStr(today);
  const todayMonthStr = toMonthStr(today);

  // Drill-down: day granularity starts on the day grid, tapping the header goes up
  // to a month grid, then up again to a year grid; month granularity starts on the
  // month grid (its own terminal view) and can only drill up to the year grid.
  const [view, setView] = useState<"day" | "month" | "year">(granularity === "month" ? "month" : "day");
  const isTerminalView = granularity === "month" ? view === "month" : view === "day";

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
    if (view === "year") {
      setCursor(new Date(cursor.getFullYear() + delta * 12, cursor.getMonth(), 1));
    } else if (view === "month") {
      setCursor(new Date(cursor.getFullYear() + delta, cursor.getMonth(), 1));
    } else {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    }
  }

  const yearBlockStart = cursor.getFullYear() - 5;
  const years = Array.from({ length: 12 }, (_, i) => yearBlockStart + i);

  return (
    <>
      <div className={cn("flex items-center justify-between mb-3", c.text)}>
        <button
          type="button"
          onClick={() => shift(-1)}
          className={cn("size-8 rounded-full flex items-center justify-center transition-colors", c.hoverBg)}
        >
          <ChevronLeft className="size-4" />
        </button>
        {view === "year" ? (
          <p className="text-sm font-semibold">{years[0]}–{years[years.length - 1]}</p>
        ) : (
          <button
            type="button"
            onClick={() => setView(view === "day" ? "month" : "year")}
            className="text-sm font-semibold capitalize hover:opacity-70 transition-opacity"
          >
            {view === "month" ? cursor.getFullYear() : cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </button>
        )}
        <button
          type="button"
          onClick={() => shift(1)}
          className={cn("size-8 rounded-full flex items-center justify-center transition-colors", c.hoverBg)}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {view === "year" ? (
        <div className="grid grid-cols-3 gap-1">
          {years.map((year) => {
            const isCursorYear = year === cursor.getFullYear();
            const isCurrent = year === today.getFullYear();
            return (
              <button
                key={year}
                type="button"
                onClick={() => pickYear(year)}
                className={cn(
                  "rounded-lg text-sm py-3 transition-colors",
                  !isCursorYear && cn(c.text, c.hoverBg),
                  isCursorYear && cn(c.selectedBg, "font-semibold"),
                  !isCursorYear && isCurrent && c.ring,
                )}
              >
                {year}
              </button>
            );
          })}
        </div>
      ) : view === "month" ? (
        <div className="grid grid-cols-3 gap-1">
          {MONTH_NAMES.map((name, i) => {
            const date = new Date(cursor.getFullYear(), i, 1);
            const monthStr = toMonthStr(date);
            const isSelected = granularity === "month" && monthStr === value;
            const isCurrent = monthStr === todayMonthStr;
            return (
              <button
                key={name}
                type="button"
                onClick={() => pickMonth(date)}
                className={cn(
                  "rounded-lg text-sm py-3 transition-colors",
                  !isSelected && cn(c.text, c.hoverBg),
                  isSelected && cn(c.selectedBg, "font-semibold"),
                  !isSelected && isCurrent && c.ring,
                )}
              >
                {name.slice(0, 3)}
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className={cn("text-[11px] font-medium text-center py-1", c.muted)}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {buildDayGrid(cursor).map((date) => {
              const dateStr = toDateStr(date);
              const inMonth = date.getMonth() === cursor.getMonth();
              const isSelected = dateStr === value;
              const isToday = dateStr === todayStr;
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => pickDate(date)}
                  className={cn(
                    "size-10 mx-auto rounded-full text-sm flex items-center justify-center transition-colors",
                    !inMonth && c.faded,
                    inMonth && !isSelected && cn(c.text, c.hoverBg),
                    isSelected && cn(c.selectedBg, "font-semibold"),
                    !isSelected && isToday && c.ring,
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </>
      )}

      {isTerminalView && (
        <div className={cn("flex items-center gap-2 mt-3 pt-3 border-t", c.border)}>
          <button
            type="button"
            onClick={() => (granularity === "month" ? pickMonth(today) : pickDate(today))}
            className={cn("flex-1 text-center text-xs font-medium transition-colors", c.muted, dark ? "hover:text-white" : "hover:text-foreground")}
          >
            {granularity === "month" ? "This month" : "Today"}
          </button>
          {onClear && (
            <button
              type="button"
              onClick={() => { onClear(); onClose(); }}
              className={cn("flex-1 text-center text-xs font-medium transition-colors", c.muted, dark ? "hover:text-white" : "hover:text-foreground")}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </>
  );
}

export function DatePicker({ value, onChange, granularity = "day", triggerClassName, label, placeholder, onClear, dark }: DatePickerProps) {
  const selected = parseDateStr(value);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));
  const isMobile = useIsMobile();

  function openChange(v: boolean) {
    setOpen(v);
    if (v) setCursor(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }

  const triggerLabel = label ?? (
    !value && placeholder
      ? placeholder
      : granularity === "month"
        ? selected.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
        : smartDayLabel(selected)
  );

  const triggerBtn = (
    <button
      type="button"
      onClick={() => openChange(true)}
      className={cn(
        "h-12 w-full rounded-lg px-3.5 text-sm mt-1 mb-2 flex items-center gap-2.5 outline-none transition-colors focus-visible:ring-1 cursor-pointer",
        dark
          ? "bg-white/10 focus-visible:border-white/40 focus-visible:ring-white/20"
          : "bg-foreground/3 focus-visible:border-ring focus-visible:ring-foreground/15",
        triggerClassName,
      )}
    >
      <CalendarIcon className={cn("size-4 shrink-0", dark ? "text-white" : "text-foreground")} />
      <span className="truncate leading-none">{triggerLabel}</span>
    </button>
  );

  if (isMobile) {
    return (
      <>
        {triggerBtn}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent sheetClassName={dark ? "bg-[#0f1533]/95 backdrop-blur-xl text-white border border-white/10" : undefined}>
            <DialogHeader>
              <DialogTitle className={dark ? "text-white" : undefined}>
                {granularity === "month" ? "Choose month" : "Choose date"}
              </DialogTitle>
            </DialogHeader>
            <CalendarContent
              value={value}
              onChange={onChange}
              granularity={granularity}
              cursor={cursor}
              setCursor={setCursor}
              onClose={() => setOpen(false)}
              onClear={onClear}
              dark={dark}
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger
        type="button"
        className={cn(
          "h-12 w-full rounded-lg px-3.5 text-sm mt-1 mb-2 flex items-center gap-2.5 outline-none transition-colors focus-visible:ring-1 cursor-pointer",
          dark
            ? "bg-white/10 focus-visible:border-white/40 focus-visible:ring-white/20"
            : "bg-foreground/3 focus-visible:border-ring focus-visible:ring-foreground/15",
          triggerClassName,
        )}
      >
        <CalendarIcon className={cn("size-4 shrink-0", dark ? "text-white" : "text-foreground")} />
        <span className="truncate leading-none">{triggerLabel}</span>
      </PopoverTrigger>
      <PopoverContent className={cn("w-64 rounded-lg border-none shadow-md", dark && "bg-[#0f1533]/95 backdrop-blur-xl text-white border border-white/10")}>
        <CalendarContent
          value={value}
          onChange={onChange}
          granularity={granularity}
          cursor={cursor}
          setCursor={setCursor}
          onClose={() => setOpen(false)}
          onClear={onClear}
          dark={dark}
        />
      </PopoverContent>
    </Popover>
  );
}

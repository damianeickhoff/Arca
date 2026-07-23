"use client";

import { useState } from "react";
import { IconCalendarWeek as CalendarIcon } from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePicker } from "@/components/date-picker";
import { cn } from "@/lib/utils";
import { financialMonthRange, type FinancialMonthConfig } from "@/lib/date-range";

export type CategoryPeriodPreset = "budget" | "week" | "month" | "3m" | "6m" | "year" | "custom";

export interface CategoryPeriod {
  preset: CategoryPeriodPreset;
  from: string;
  to: string;
  label: string;
}

function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

/** Computes the [from,to] + label for every preset except "custom" (which needs
 * user-picked dates). `budgetPeriod` is the app's actual active budget range,
 * passed down from the dashboard so "Budget period" needs no extra query. */
export function resolveCategoryPeriod(
  preset: Exclude<CategoryPeriodPreset, "custom">,
  financialMonth: FinancialMonthConfig,
  budgetPeriod: { from: string; to: string },
): CategoryPeriod {
  const year = new Date().getFullYear();
  switch (preset) {
    case "budget":
      return { preset, from: budgetPeriod.from, to: budgetPeriod.to, label: "Budget period" };
    case "week":
      return { preset, from: startOfWeek(), to: endOfWeek(), label: "Week" };
    case "month": {
      const r = financialMonthRange(financialMonth, 0);
      return { preset, from: r.from, to: r.to, label: "Month" };
    }
    case "3m": {
      const from = financialMonthRange(financialMonth, -2).from;
      const to = financialMonthRange(financialMonth, 0).to;
      return { preset, from, to, label: "Last 3 months" };
    }
    case "6m": {
      const from = financialMonthRange(financialMonth, -5).from;
      const to = financialMonthRange(financialMonth, 0).to;
      return { preset, from, to, label: "Last 6 months" };
    }
    case "year":
      return { preset, from: `${year}-01-01`, to: `${year}-12-31`, label: "Year" };
  }
}

/** Natural phrasing for the small "current period" caption under the Avg spent
 * card — distinct from the picker's own option labels ("Week", "Last 3 months") so
 * it reads as a sentence fragment ("This week") rather than a menu item. */
export function periodDescriptor(preset: CategoryPeriodPreset): string {
  switch (preset) {
    case "budget": return "This period";
    case "week": return "This week";
    case "month": return "This month";
    case "3m": return "Last 3 months";
    case "6m": return "Last 6 months";
    case "year": return "This year";
    case "custom": return "Custom period";
  }
}

const PRESET_OPTIONS: { value: Exclude<CategoryPeriodPreset, "custom">; label: string }[] = [
  { value: "budget", label: "Budget period" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "year", label: "Year" },
];

export function CategoryPeriodPicker({
  value,
  onChange,
  financialMonth,
  budgetPeriod,
  triggerClassName,
}: {
  value: CategoryPeriod;
  onChange: (p: CategoryPeriod) => void;
  financialMonth: FinancialMonthConfig;
  budgetPeriod: { from: string; to: string };
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(value.from);
  const [customTo, setCustomTo] = useState(value.to);
  const [showCustom, setShowCustom] = useState(false);

  function pick(preset: Exclude<CategoryPeriodPreset, "custom">) {
    onChange(resolveCategoryPeriod(preset, financialMonth, budgetPeriod));
    setOpen(false);
    setShowCustom(false);
  }

  function applyCustom() {
    if (!customFrom || !customTo || customFrom > customTo) return;
    onChange({ preset: "custom", from: customFrom, to: customTo, label: "Custom period" });
    setOpen(false);
    setShowCustom(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Change period"
        className={cn("size-11 rounded-full bg-white/7 flex items-center justify-center active:scale-95 transition-transform", triggerClassName)}
      >
        <CalendarIcon className="size-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Period</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-1 -mx-1">
            {PRESET_OPTIONS.map((opt) => {
              const active = value.preset === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => pick(opt.value)}
                  className={cn(
                    "w-full text-left text-sm px-4 py-3.5 rounded-xl transition-colors",
                    active ? "bg-foreground text-primary-foreground font-medium" : "hover:bg-foreground/5 text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowCustom((v) => !v)}
              className={cn(
                "w-full text-left text-sm px-4 py-3.5 rounded-xl transition-colors",
                value.preset === "custom" ? "bg-foreground text-primary-foreground font-medium" : "hover:bg-foreground/5 text-foreground",
              )}
            >
              Custom period
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

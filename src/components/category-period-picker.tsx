"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconCalendarEvent, IconCheck, IconChevronDown } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { DatePicker } from "@/components/date-picker";
import { cn } from "@/lib/utils";
import { financialMonthRange, type FinancialMonthConfig } from "@/lib/date-range";

export type CategoryPeriodPreset = "budget" | "week" | "month" | "3m" | "6m" | "year" | "custom";

export interface CategoryPeriod {
  preset: CategoryPeriodPreset;
  from: string;
  to: string;
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

/** Computes the [from,to] for every preset except "custom" (which needs user-picked
 * dates). `budgetPeriod` is the app's actual active budget range, passed down by the
 * caller so "Budget period" needs no extra query. */
export function resolveCategoryPeriod(
  preset: Exclude<CategoryPeriodPreset, "custom">,
  financialMonth: FinancialMonthConfig,
  budgetPeriod: { from: string; to: string },
): CategoryPeriod {
  const year = new Date().getFullYear();
  switch (preset) {
    case "budget":
      return { preset, from: budgetPeriod.from, to: budgetPeriod.to };
    case "week":
      return { preset, from: startOfWeek(), to: endOfWeek() };
    case "month": {
      const r = financialMonthRange(financialMonth, 0);
      return { preset, from: r.from, to: r.to };
    }
    case "3m":
      return { preset, from: financialMonthRange(financialMonth, -2).from, to: financialMonthRange(financialMonth, 0).to };
    case "6m":
      return { preset, from: financialMonthRange(financialMonth, -5).from, to: financialMonthRange(financialMonth, 0).to };
    case "year":
      return { preset, from: `${year}-01-01`, to: `${year}-12-31` };
  }
}

const PRESETS: Exclude<CategoryPeriodPreset, "custom">[] = ["budget", "week", "month", "3m", "6m", "year"];

const DATE_TRIGGER =
  "mt-0 mb-0 h-12 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile px-4 font-clear text-[15px] font-bold text-clear-ink focus-visible:border-clear-ink focus-visible:ring-0";

/** The period's name for the trigger chip and captions: the preset, or the dates. */
export function usePeriodLabel() {
  const t = useTranslations("categoryDetail.period");
  const locale = useLocale();
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  return (p: CategoryPeriod) =>
    p.preset === "custom"
      ? t("range", { from: fmt.format(new Date(`${p.from}T12:00:00`)), to: fmt.format(new Date(`${p.to}T12:00:00`)) })
      : t(`presets.${p.preset}`);
}

/**
 * The period chip in the category detail: a pill naming the period that opens a
 * small sheet (centred on desktop) with the presets and a custom range.
 */
export function CategoryPeriodPicker({
  value,
  onChange,
  financialMonth,
  budgetPeriod,
}: {
  value: CategoryPeriod;
  onChange: (p: CategoryPeriod) => void;
  financialMonth: FinancialMonthConfig;
  budgetPeriod: { from: string; to: string };
}) {
  const t = useTranslations("categoryDetail.period");
  const label = usePeriodLabel();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(value.from);
  const [customTo, setCustomTo] = useState(value.to);
  const [showCustom, setShowCustom] = useState(value.preset === "custom");
  const customValid = !!customFrom && !!customTo && customFrom <= customTo;

  function pick(preset: Exclude<CategoryPeriodPreset, "custom">) {
    onChange(resolveCategoryPeriod(preset, financialMonth, budgetPeriod));
    setOpen(false);
    setShowCustom(false);
  }

  function applyCustom() {
    if (!customValid) return;
    onChange({ preset: "custom", from: customFrom, to: customTo });
    setOpen(false);
  }

  const option = (active: boolean) =>
    cn(
      "flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-clear-row px-4 text-left font-clear text-[15px] transition-colors",
      active ? "bg-clear-tile font-bold text-clear-ink" : "font-semibold text-clear-ink-2 hover:bg-clear-tile",
    );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t("change", { period: label(value) })}
        className="inline-flex h-9 cursor-pointer items-center gap-2 self-start rounded-full bg-clear-tile px-3.5 font-clear text-[13px] font-bold text-clear-ink transition-colors hover:bg-clear-line"
      >
        <IconCalendarEvent size={16} stroke={2} aria-hidden />
        {label(value)}
        <IconChevronDown size={14} stroke={2.4} aria-hidden />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent hideHeaderRow title={t("title")} className="gap-4 pt-6">
          <ClearDialogHeader title={t("title")} onClose={() => setOpen(false)} closeLabel={t("close")} />

          <div role="radiogroup" aria-label={t("title")} className="flex flex-col gap-0.5">
            {PRESETS.map((p) => {
              const active = value.preset === p;
              return (
                <button key={p} type="button" role="radio" aria-checked={active} onClick={() => pick(p)} className={option(active)}>
                  {t(`presets.${p}`)}
                  {active && <IconCheck size={18} stroke={2.4} aria-hidden />}
                </button>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={value.preset === "custom"}
              onClick={() => setShowCustom((v) => !v)}
              className={option(value.preset === "custom")}
            >
              {t("presets.custom")}
              {value.preset === "custom" && <IconCheck size={18} stroke={2.4} aria-hidden />}
            </button>
          </div>

          {showCustom && (
            <div className="flex flex-col gap-3 border-t border-clear-line pt-4 pb-1">
              <div className="grid grid-cols-2 gap-3">
                <div role="group" aria-labelledby="period-from" className="flex flex-col gap-1.5">
                  <span id="period-from" className="text-[13px] font-bold text-clear-ink-2">{t("from")}</span>
                  <DatePicker value={customFrom} onChange={setCustomFrom} triggerClassName={DATE_TRIGGER} />
                </div>
                <div role="group" aria-labelledby="period-to" className="flex flex-col gap-1.5">
                  <span id="period-to" className="text-[13px] font-bold text-clear-ink-2">{t("to")}</span>
                  <DatePicker value={customTo} onChange={setCustomTo} triggerClassName={DATE_TRIGGER} />
                </div>
              </div>
              {!customValid && customFrom && customTo && (
                <span role="alert" className="text-[13px] font-semibold text-clear-negative">{t("rangeInvalid")}</span>
              )}
              <button type="button" onClick={applyCustom} disabled={!customValid} className={cn(clearButtonVariants({ size: "lg" }), "w-full")}>
                {t("apply")}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

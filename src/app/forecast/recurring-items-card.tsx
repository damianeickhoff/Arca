"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { IconCalendar, IconInfoCircle, IconPlus } from "@tabler/icons-react";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader, ClearCardLink } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { Icon } from "@/components/icon";
import { formatEur, formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ItemType, PlanItem, PlanMonth } from "./load-forecast";
import { OverrideDialog } from "./override-dialog";
import { amountFor, usualFor } from "./plan-amounts";
import { MoneyText } from "@/components/clear/money";
import { AddRecurringButton } from "@/components/settings/recurring/add-recurring-button";

const GROUPS: ItemType[] = ["income", "bill", "subscription", "debt", "plan", "savings", "budget"];

/**
 * Everything the plan is built from — recurring items by type, savings goals and
 * category budgets — with each one's amount for the plan month. Tap a row to change
 * that one month (OverrideDialog); a changed month shows as a butter chip.
 */
export function RecurringItemsCard({
  items,
  month,
  months,
  allowedMonths,
}: {
  items: PlanItem[];
  month: string;
  months: Record<string, PlanMonth>;
  allowedMonths: string[];
}) {
  const t = useTranslations("insights.forecast.items");
  const [open, setOpen] = useState<{ item: PlanItem | null; session: number }>({ item: null, session: 0 });
  const label = months[month];

  const header = (
    <ClearCardHeader
      title={<span id="forecast-items-title">{t("title")}</span>}
      subtitle={t("subtitle")}
      action={
        <AddRecurringButton className={cn(clearButtonVariants({ variant: "secondary", size: "sm" }), "h-10 px-4 text-sm no-underline")}>
          <IconPlus aria-hidden />
          {t("add")}
        </AddRecurringButton>
      }
    />
  );

  if (items.length === 0) {
    return (
      <ClearCard aria-labelledby="forecast-items-title" className="lg:col-span-2 xl:col-span-3">
        {header}
        <div className="flex flex-col items-center gap-4 rounded-clear-tile border-2 border-dashed border-clear-line px-6 py-10 text-center">
          <span aria-hidden className="flex items-end gap-1.5">
            <span className="h-8 w-5 rounded-md bg-clear-mint" />
            <span className="h-12 w-5 rounded-md bg-clear-stone" />
            <span className="h-6 w-5 rounded-md bg-clear-sky" />
          </span>
          <p className="m-0 max-w-md text-[15px] text-clear-ink-2">{t("empty")}</p>
          <AddRecurringButton className={cn(clearButtonVariants(), "no-underline")}>
            <IconPlus aria-hidden />
            {t("add")}
          </AddRecurringButton>
        </div>
      </ClearCard>
    );
  }

  return (
    <ClearCard aria-labelledby="forecast-items-title" className="gap-5 lg:col-span-2 xl:col-span-3">
      {header}

      <div className="columns-1 gap-7 md:columns-2 xl:columns-3">
        {GROUPS.map((type) => {
          const list = items.filter((i) => i.type === type);
          if (list.length === 0) return null;
          const total = list.reduce((s, i) => s + amountFor(i, month), 0);
          return (
            <section key={type} aria-label={t(`types.${type}`)} className="mb-6 flex break-inside-avoid flex-col">
              <div className="flex h-10 items-center justify-between gap-2 rounded-clear-icon bg-clear-tile px-3">
                <span className="truncate text-sm font-bold">
                  {t(`types.${type}`)} <span className="font-semibold text-clear-muted">{type === "savings" ? t("goals", { count: list.length }) : t("count", { count: list.length })}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-sm font-extrabold tabular-nums",
                    type === "income" && "text-clear-positive",
                    type === "savings" && "text-clear-info",
                  )}
                >
                  <MoneyText>{t("perMonth", { amount: `${type === "income" ? "+" : type === "savings" ? "" : "−"}${formatEur(total)}` })}</MoneyText>
                </span>
              </div>
              {list.map((item) => {
                const amount = amountFor(item, month);
                const override = item.overrides[month];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setOpen((o) => ({ item, session: o.session + 1 }))}
                    aria-label={t("open", { name: item.name, month: label?.name ?? month })}
                    className="flex min-h-[60px] w-full cursor-pointer items-center gap-3 rounded-clear-row border-b border-clear-ground px-1 py-2 text-left font-clear text-clear-ink transition-colors last:border-b-0 hover:bg-clear-tile"
                  >
                    <Icon iconKey={item.icon} color={item.color} background={item.background} size="md" soft />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[15px] font-bold">{item.name}</span>
                        <span className="truncate text-[13px] text-clear-muted"><MoneyText>{item.meta}</MoneyText></span>
                      </span>
                      {override != null && (
                        <ClearChip tone="butter" icon={<IconCalendar aria-hidden />} className="self-start font-bold">
                          <MoneyText>{t("override", { month: label?.short ?? month, amount: formatEurWhole(override), usual: formatEurWhole(usualFor(item, month)) })}</MoneyText>
                        </ClearChip>
                      )}
                    </span>
                    {type === "income" ? (
                      <Amount value={amount} sign="always" className="text-[15px] text-clear-positive" />
                    ) : type === "savings" ? (
                      <Amount value={amount} sign="none" className="text-[15px] text-clear-info" />
                    ) : (
                      <Amount value={-amount} className="text-[15px]" />
                    )}
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-clear-ground pt-4">
        <span className="inline-flex items-center gap-2 text-sm text-clear-ink-2">
          <IconInfoCircle size={18} stroke={1.9} className="shrink-0" aria-hidden />
          {t("hint")}
        </span>
        <ClearCardLink href="/settings?panel=recurring">{t("manage")}</ClearCardLink>
      </div>

      <OverrideDialog
        key={open.session}
        item={open.item}
        initialMonth={month}
        months={months}
        allowedMonths={allowedMonths}
        onClose={() => setOpen((o) => ({ ...o, item: null }))}
      />
    </ClearCard>
  );
}

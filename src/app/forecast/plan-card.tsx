import { getLocale, getTranslations } from "next-intl/server";
import { IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader, ClearCardLink, ClearTile } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { ClearProgress } from "@/components/clear/progress";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ForecastData } from "./load-forecast";
import { MonthStepper } from "./month-stepper";
import { MoneyText } from "@/components/clear/money";

const KIND_FILL = { needs: "bg-clear-primary", wants: "bg-clear-ember", savings: "bg-clear-info-fill" } as const;

/**
 * The plan for one budget month, built from the recurring items: the expected income
 * split into recurring bills, savings, category budgets and what is left free, then
 * the same month against the needs / wants / savings strategy. The month stepper in
 * the header drives this card and Recurring items.
 */
export async function PlanCard({ data }: { data: ForecastData }) {
  const t = await getTranslations("insights.forecast.plan");
  const ts = await getTranslations("insights.forecast.strategy");
  const locale = await getLocale();
  const dateLocale = locale === "nl" ? "nl-NL" : "en-GB";
  const short = (date: string) => new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
  const listFormat = new Intl.ListFormat(dateLocale, { style: "long", type: "conjunction" });
  const names = (list: string[]) =>
    list.length <= 3 ? listFormat.format(list) : t("andMore", { names: list.slice(0, 3).join(", "), count: list.length - 3 });

  const month = data.months[data.month];
  const p = data.plan;
  const spent = p.recurring + p.debts + p.savings + p.budgets;
  const pct = (v: number) => (p.income > 0 ? `${Math.round((v / p.income) * 100)}%` : null);

  const rows = [
    { key: "recurring", value: p.recurring, fill: "bg-clear-primary", name: t("recurring"), meta: names(p.recurringNames) },
    { key: "debts", value: p.debts, fill: "bg-clear-rose-ink", name: t("debts"), meta: t("debtsMeta") },
    { key: "savings", value: p.savings, fill: "bg-clear-info-fill", name: t("savings"), meta: t("savingsMeta", { count: p.savingsNames.length, names: names(p.savingsNames) }) },
    { key: "budgets", value: p.budgets, fill: "bg-clear-lilac-ink", name: p.budgetSource === "overall" ? t("budgetOverall") : t("budgets"), meta: p.budgetSource === "overall" ? t("budgetOverallMeta") : t("budgetsMeta", { count: p.budgetNames.length, names: names(p.budgetNames) }) },
    { key: "free", value: Math.max(0, p.free), fill: "bg-clear-ember", name: t("free"), meta: t("freeMeta", { amount: formatEurWhole(p.free / p.days) }) },
  ].filter((r) => r.value > 0);

  const labels = Object.fromEntries(Object.values(data.months).map((m) => [m.key, m.long]));
  const stepper = <MonthStepper month={data.month} months={data.allowedMonths} labels={labels} />;
  const header = (
    <ClearCardHeader
      title={<span id="forecast-plan-title">{t("title", { month: month.name })}</span>}
      subtitle={t("subtitle", { from: short(month.from), to: short(month.to) })}
      action={stepper}
    />
  );

  if (p.income === 0 && spent === 0) {
    return (
      <ClearCard aria-labelledby="forecast-plan-title" className="gap-5 lg:col-span-2">
        {header}
        <div aria-hidden className="h-7 rounded-full border-2 border-dashed border-clear-line" />
        <div className="flex flex-col items-start gap-3">
          <p className="m-0 text-[15px] text-clear-ink-2">{t("emptyBody")}</p>
          <Link href="/settings/recurring/add" className={cn(clearButtonVariants(), "no-underline")}>
            <IconPlus aria-hidden />
            {t("emptyAction")}
          </Link>
        </div>
      </ClearCard>
    );
  }

  const strategy = data.strategy;
  const kinds = [
    { key: "needs" as const, amount: p.needs, target: strategy.nodig },
    { key: "wants" as const, amount: p.wants, target: strategy.willen },
    { key: "savings" as const, amount: p.savingsKind, target: strategy.sparen },
  ];
  const savingsPct = p.income > 0 ? Math.round((p.savingsKind / p.income) * 100) : 0;
  const savingsGoal = (p.income * strategy.sparen) / 100;
  const savingsDiff = Math.round(p.savingsKind - savingsGoal);

  return (
    <ClearCard aria-labelledby="forecast-plan-title" className="gap-5 lg:col-span-2">
      {header}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <Amount value={p.income} whole className="text-[34px] tracking-[-0.035em] lg:text-[40px]" />
          <span className="text-sm text-clear-ink-2">
            {p.income > 0 ? (p.incomeNames.length > 0 ? t("incomeFrom", { names: names(p.incomeNames) }) : t("income")) : t("noIncome")}
          </span>
        </div>
        <div
          role="img"
          aria-label={t("barLabel", {
            income: formatEurWhole(p.income),
            parts: rows.map((r) => t("part", { name: r.name, amount: formatEurWhole(r.value), pct: pct(r.value) ?? "—" })).join(", "),
          })}
          className="flex h-7 gap-[3px] overflow-hidden rounded-full bg-clear-tile"
        >
          {rows.map((r) => (
            <span key={r.key} className={r.fill} style={{ flex: `${Math.max(r.value, Math.max(p.income, spent) * 0.01)} 1 0` }} />
          ))}
        </div>
      </div>

      <div className="flex flex-col">
        {rows.map((r) => (
          <div key={r.key} className="flex min-h-14 items-center gap-3.5 border-b border-clear-ground py-2 last:border-b-0">
            <span aria-hidden className={cn("size-3.5 shrink-0 rounded-[4px]", r.fill)} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-bold">{r.name}</span>
              <span className="truncate text-[13px] text-clear-muted"><MoneyText>{r.meta}</MoneyText></span>
            </span>
            {pct(r.value) && <ClearChip className="hidden sm:inline-flex">{pct(r.value)}</ClearChip>}
            <span className="clear-amount min-w-[84px] text-right text-base"><MoneyText>{formatEurWhole(r.value)}</MoneyText></span>
          </div>
        ))}
        {p.free < 0 && (
          <div className="flex min-h-14 items-center gap-3.5 py-2">
            <span aria-hidden className="size-3.5 shrink-0 rounded-[4px] bg-clear-negative-fill" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-bold">{t("short")}</span>
              <span className="text-[13px] text-clear-muted"><MoneyText>{t("shortMeta", { amount: formatEurWhole(-p.free) })}</MoneyText></span>
            </span>
            <span className="clear-amount min-w-[84px] text-right text-base text-clear-negative">−<MoneyText>{formatEurWhole(-p.free)}</MoneyText></span>
          </div>
        )}
      </div>

      {p.income > 0 && (
        <ClearTile className="mt-auto flex flex-col gap-3.5 sm:px-[18px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-bold">{ts("title")}</span>
              <span className="text-sm text-clear-ink-2">
                {ts.rich("setTo", {
                  needs: strategy.nodig,
                  wants: strategy.willen,
                  savings: strategy.sparen,
                  b: (c) => <b className="text-clear-ink">{c}</b>,
                })}
              </span>
            </span>
            <ClearCardLink href="/budget">{ts("change")}</ClearCardLink>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {kinds.map((k) => {
              const share = (k.amount / p.income) * 100;
              return (
                <div key={k.key} className="flex min-w-0 flex-col gap-2 rounded-clear-icon bg-clear-card p-3">
                  <span className="flex justify-between gap-1 text-[13px] font-bold text-clear-ink-2">
                    <span className="truncate">{ts(k.key)}</span>
                    <span className={cn("shrink-0 tabular-nums", share > k.target && k.key !== "savings" && "text-clear-negative")}>{Math.round(share)}%</span>
                  </span>
                  <span className="clear-amount truncate text-lg"><MoneyText>{formatEurWhole(k.amount)}</MoneyText></span>
                  <ClearProgress size="sm" value={share / 100} marker={k.target / 100} fillClassName={KIND_FILL[k.key]} className="bg-clear-tile" />
                  <span className="truncate text-xs text-clear-muted">{ts("ofTarget", { target: k.target })}</span>
                </div>
              );
            })}
          </div>
          <span className="text-[13px] text-clear-ink-2">
            <MoneyText>{Math.abs(savingsDiff) < 1
              ? ts("savingsOn", { amount: formatEurWhole(p.savingsKind), target: strategy.sparen })
              : ts(savingsDiff < 0 ? "savingsUnder" : "savingsOver", {
                  amount: formatEurWhole(p.savingsKind),
                  pct: savingsPct,
                  diff: formatEurWhole(Math.abs(savingsDiff)),
                  target: strategy.sparen,
                })}</MoneyText>
          </span>
        </ClearTile>
      )}
    </ClearCard>
  );
}

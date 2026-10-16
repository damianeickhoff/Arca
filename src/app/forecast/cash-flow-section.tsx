"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  IconAlertTriangle,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconCheck,
  IconCoins,
  IconPlus,
  IconTrendingDown,
  IconTrendingUp,
} from "@tabler/icons-react";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader, ClearTile } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { Segmented } from "@/components/clear/segmented";
import { StatTile } from "@/components/clear/stat-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { formatEur, formatEurWhole } from "@/lib/format";
import { shiftDate, daysInclusive } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import type { CashFlowForecast, ForecastStatus } from "@/lib/cash-flow-forecast-shared";
import { CashFlowChart } from "./cash-flow-chart";
import { MoneyText } from "@/components/clear/money";

type Range = "d30" | "d90";
const RANGE_DAYS: Record<Range, number> = { d30: 30, d90: 90 };

const STATUS_CHIP: Record<ForecastStatus, { tone: "mint" | "butter" | "rose" | "neutral"; icon: React.ReactNode }> = {
  healthy: { tone: "mint", icon: <IconCheck stroke={3} aria-hidden /> },
  warning: { tone: "butter", icon: <IconAlertTriangle stroke={2.4} aria-hidden /> },
  critical: { tone: "rose", icon: <IconTrendingDown stroke={2.4} aria-hidden /> },
  empty: { tone: "neutral", icon: <IconTrendingUp stroke={2.4} aria-hidden /> },
};

/**
 * The cash flow half of Forecast: the projected balance chart (two columns wide) and,
 * beside it, the range in numbers above the black status card. The 30 days · 3 months
 * switch drives all three. Returns grid items for the tab's one grid.
 */
export function CashFlowSection({ cashFlow, today }: { cashFlow: CashFlowForecast; today: string }) {
  const t = useTranslations("insights.forecast");
  const locale = useLocale();
  const dateLocale = locale === "nl" ? "nl-NL" : "en-GB";
  const [range, setRange] = useState<Range>("d30");

  const shortDate = (date: string) => new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
  const longDate = (date: string) => new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));

  const end = shiftDate(today, RANGE_DAYS[range]);
  const points = cashFlow.points.filter((p) => p.date <= end);
  const events = cashFlow.events.filter((e) => e.date <= end);
  const totalIn = events.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const totalOut = events.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0);
  const net = totalIn - totalOut;
  const nextIncome = events.find((e) => e.amount > 0) ?? null;

  let lowest = points[0] ?? { date: today, amount: cashFlow.current, change: 0 };
  for (const p of points) if (p.amount < lowest.amount) lowest = p;
  const firstNegative = points.find((p) => p.amount < 0) ?? null;
  const threshold = cashFlow.warningThreshold;
  const status: ForecastStatus =
    cashFlow.status === "empty" ? "empty" : lowest.amount < 0 ? "critical" : lowest.amount < threshold ? "warning" : "healthy";

  const whole = (v: number) => `${v < 0 ? "−" : ""}${formatEurWhole(Math.abs(v))}`;
  const bold = (c: React.ReactNode) => <b className="text-clear-hero-ink">{c}</b>;
  const last = points[points.length - 1] ?? lowest;

  const chartLabel = t("chart.label", {
    from: longDate(today),
    to: longDate(last.date),
    start: whole(cashFlow.current),
    lowest: whole(lowest.amount),
    lowestDate: longDate(lowest.date),
    end: whole(last.amount),
  });

  return (
    <>
      {/* Projected balance */}
      <ClearCard aria-labelledby="forecast-chart-title" className="gap-4 lg:col-span-2">
        <ClearCardHeader
          title={<span id="forecast-chart-title">{t("chart.title", { range })}</span>}
          subtitle={cashFlow.hasStartingBalance ? t("chart.subtitle") : t("chart.subtitleCumulative")}
          action={
            <span data-tip-anchor="insightsForecastRange">
              <Segmented
                label={t("range.label")}
                surface="tile"
                size="sm"
                value={range}
                onChange={setRange}
                items={[
                  { value: "d30", label: t("range.d30") },
                  { value: "d90", label: t("range.d90") },
                ]}
              />
            </span>
          }
        />
        <ClearTile className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
          <span className="text-sm text-clear-ink-2">
            <MoneyText>{cashFlow.hasStartingBalance
              ? t.rich("chart.balanceToday", { amount: `${cashFlow.current < 0 ? "−" : ""}${formatEur(Math.abs(cashFlow.current))}`, b: (c) => <b className="tabular-nums text-clear-ink"><MoneyText>{c}</MoneyText></b> })
              : t("chart.cashFlowToday")}</MoneyText>
          </span>
          <span aria-hidden className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] font-semibold text-clear-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[3px] w-4 rounded-full bg-clear-ink" />
              {t("legend.expected")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-clear-ember" />
              {t("legend.lowest")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-clear-positive-fill" />
              {t("legend.in")}
            </span>
            {threshold > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-clear-negative-fill" />
                {t("legend.safety")}
              </span>
            )}
          </span>
        </ClearTile>
        <CashFlowChart points={points} events={events} threshold={threshold} label={chartLabel} />
      </ClearCard>

      <div className="flex flex-col gap-5 lg:col-span-2 lg:grid lg:grid-cols-2 xl:col-span-1 xl:flex">
        {/* The range in numbers */}
        <section aria-label={t("numbers.label", { range })} className="grid grid-cols-2 gap-2.5 rounded-clear-card bg-clear-card p-3.5 font-clear text-clear-ink">
          <StatTile
            highlight
            label={t("numbers.nextIncome")}
            icon={<IconCoins aria-hidden />}
            value={nextIncome ? <Amount value={nextIncome.amount} whole className="text-[26px] lg:text-[30px]" /> : <span className="clear-amount text-[26px] lg:text-[30px]">—</span>}
            foot={
              nextIncome
                ? t("numbers.nextIncomeFoot", { name: nextIncome.name, date: shortDate(nextIncome.date), days: daysInclusive(today, nextIncome.date) - 1 })
                : t("numbers.noIncome")
            }
          />
          <StatTile
            label={t("numbers.in")}
            icon={<IconArrowDownLeft className="text-clear-positive" aria-hidden />}
            value={<Amount value={totalIn} whole className="text-[26px] lg:text-[30px]" />}
            foot={t("numbers.inFoot", { count: events.filter((e) => e.amount > 0).length })}
          />
          <StatTile
            label={t("numbers.out")}
            icon={<IconArrowUpRight className="text-clear-negative" aria-hidden />}
            value={<Amount value={totalOut} whole className="text-[26px] lg:text-[30px]" />}
            foot={t("numbers.outFoot", { count: events.filter((e) => e.amount < 0).length })}
          />
          <StatTile
            label={t("numbers.net")}
            icon={net >= 0 ? <IconTrendingUp aria-hidden /> : <IconTrendingDown aria-hidden />}
            value={<Amount value={net} whole sign="always" className={cn("text-[26px] lg:text-[30px]", net > 0 && "text-clear-positive", net < 0 && "text-clear-negative")} />}
            foot={t("numbers.netFoot", { date: longDate(end) })}
          />
        </section>

        {/* The answer: does the money last? */}
        <ClearCard hero aria-labelledby="forecast-status-title" className="flex-1 gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="forecast-status-title" className="m-0 text-[17px] font-bold">
              {t("status.label")}
            </h2>
            <ClearChip tone={STATUS_CHIP[status].tone} icon={STATUS_CHIP[status].icon}>
              {t(`status.${status}`)}
            </ClearChip>
          </div>
          {status === "empty" ? (
            <>
              <span className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]">{t("status.emptyTitle")}</span>
              <span className="text-[15px] leading-normal text-clear-hero-ink-2">{t("status.emptyBody")}</span>
              <Link
                href="/settings/recurring/add"
                className={cn(clearButtonVariants(), "mt-auto self-start bg-clear-hero-ink text-clear-hero no-underline hover:opacity-90")}
              >
                <IconPlus aria-hidden />
                {t("status.emptyAction")}
              </Link>
            </>
          ) : (
            <>
              <span className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]">
                {status === "critical"
                  ? t("status.criticalTitle", { date: longDate(firstNegative?.date ?? lowest.date) })
                  : status === "warning"
                    ? t("status.warningTitle")
                    : t("status.healthyTitle", { range })}
              </span>
              <span className="text-[15px] leading-normal text-clear-hero-ink-2">
                <MoneyText>{status === "critical"
                  ? t.rich("status.criticalBody", { amount: whole(lowest.amount), date: longDate(lowest.date), b: bold })
                  : status === "warning"
                    ? t.rich("status.warningBody", {
                        amount: whole(lowest.amount),
                        date: longDate(lowest.date),
                        diff: formatEurWhole(threshold - lowest.amount),
                        threshold: formatEurWhole(threshold),
                        b: bold,
                      })
                    : t.rich("status.healthyBody", {
                        amount: whole(lowest.amount),
                        date: longDate(lowest.date),
                        diff: formatEurWhole(lowest.amount - threshold),
                        threshold: formatEurWhole(threshold),
                        b: bold,
                      })}</MoneyText>
              </span>
              {!cashFlow.hasStartingBalance && <span className="mt-auto text-[13px] text-clear-hero-ink-2">{t("status.cumulative")}</span>}
            </>
          )}
        </ClearCard>
      </div>
    </>
  );
}

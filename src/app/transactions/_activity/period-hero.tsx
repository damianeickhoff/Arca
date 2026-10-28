"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { IconCalendarDue, IconChevronRight, IconInbox } from "@tabler/icons-react";
import { Amount } from "@/components/clear/amount";
import { MoneyText } from "@/components/clear/money";
import { IconTile } from "@/components/clear/icon-tile";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TransactionPeriodPill } from "../transaction-filter-bar";
import type { ActivityFilters } from "./activity-view";
import type { ActivitySpendChart, ActivityTiles } from "./context";

const iso = (d: string) => new Date(`${d}T12:00:00`);

/**
 * Activity's one black hero card: how the period went. "Left after spending" (in minus
 * out) is the answer; In and Out sit under it, the period is a pill on the card, and the
 * chart shows the money out per day with the bills still scheduled after today hatched.
 * Desktop: the figures on the left, the chart on the right. Phones: a compact card with
 * a small chart beside the figure and In / Out on one line.
 */
export function PeriodHero({
  filters,
  income,
  expense,
  fixed,
  incomeCount,
  chart,
}: {
  filters: ActivityFilters;
  income: number;
  expense: number;
  fixed: number;
  incomeCount: number;
  chart: ActivitySpendChart;
}) {
  const t = useTranslations("activity.summary");
  const net = income - expense;
  const title = net >= 0 ? t("left") : t("over");
  const tile = "flex min-w-0 flex-col gap-0.5 rounded-clear-tile bg-clear-hero-ink/8 px-3.5 py-3";

  return (
    <section aria-label={t("label")} className="flex min-w-0 flex-col rounded-clear-card bg-clear-hero p-[18px] font-clear text-clear-hero-ink lg:p-6">
      {/* Phones */}
      <div className="flex flex-col gap-3 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-bold text-clear-hero-ink-2">{title}</span>
          <TransactionPeriodPill {...filters} />
        </div>
        <div className="flex items-end justify-between gap-3">
          <Amount value={net} sign="always" className="min-w-0 truncate text-[36px]" centsClassName="text-clear-hero-ink-2 opacity-100" />
          <SpendChart chart={chart} compact className="h-10 w-32 shrink-0" />
        </div>
        <div className="flex gap-[18px] text-sm text-clear-hero-ink-2">
          <span>
            {t("in")} <Amount value={income} sign="none" splitCents={false} className="text-sm font-bold tracking-normal text-clear-hero-positive" />
          </span>
          <span>
            {t("out")} <Amount value={expense} sign="none" splitCents={false} className="text-sm font-bold tracking-normal text-clear-hero-ink" />
          </span>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden min-h-0 flex-1 gap-7 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <span className="self-start">
            <TransactionPeriodPill {...filters} />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[15px] font-bold text-clear-hero-ink-2">{title}</span>
            <Amount value={net} sign="always" className="truncate text-[40px] xl:text-[48px]" centsClassName="text-clear-hero-ink-2 opacity-100" />
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2.5">
            <div className={tile}>
              <span className="text-[13px] font-bold text-clear-hero-ink-2">{t("in")}</span>
              <Amount value={income} sign="none" className="truncate text-xl text-clear-hero-positive" />
              <span className="truncate text-xs text-clear-hero-ink-2">{t("inSub", { count: incomeCount })}</span>
            </div>
            <div className={tile}>
              <span className="text-[13px] font-bold text-clear-hero-ink-2">{t("out")}</span>
              <Amount value={expense} sign="none" className="truncate text-xl" />
              <span className="truncate text-xs text-clear-hero-ink-2">
                <MoneyText>{fixed > 0 ? t("outSub", { amount: formatEur(fixed) }) : t("outSubNone")}</MoneyText>
              </span>
            </div>
          </div>
        </div>
        <SpendChartPanel chart={chart} />
      </div>
    </section>
  );
}

/** The desktop chart with its heading, the date axis and the scheduled-bills legend. */
function SpendChartPanel({ chart }: { chart: ActivitySpendChart }) {
  const t = useTranslations("activity.summary.chart");
  const locale = useLocale();
  const fmt = new Intl.DateTimeFormat(locale, chart.unit === "month" ? { month: "short", year: "numeric" } : { day: "numeric", month: "short" });
  const todayAt = chart.todayIndex != null ? ((chart.todayIndex + 0.5) / chart.bars.length) * 100 : null;
  // The start and end labels step aside when "Today" would sit on top of them.
  const showEnd = todayAt == null || todayAt < 76;
  const showStart = todayAt == null || todayAt > 24;

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-bold text-clear-hero-ink-2">{t("title", { unit: chart.unit })}</span>
        <span className="truncate font-bold">
          <MoneyText>{t("average", { amount: formatEur(Math.round(chart.perDay)).replace(/,00$/, "") })}</MoneyText>
        </span>
      </div>
      <SpendChart chart={chart} className="min-h-[120px] flex-1" />
      <div className="relative h-4 text-xs text-clear-hero-ink-2">
        {showStart && <span className="absolute left-0">{fmt.format(iso(chart.start))}</span>}
        {todayAt != null && (
          <span className="absolute -translate-x-1/2 font-bold text-clear-hero-ink" style={{ left: `${todayAt}%` }}>
            {t("today")}
          </span>
        )}
        {showEnd && <span className="absolute right-0">{fmt.format(iso(chart.end))}</span>}
      </div>
      {chart.scheduledTotal > 0 && (
        <span className="inline-flex items-center gap-2 text-xs text-clear-hero-ink-2">
          <span aria-hidden className="clear-hatch-hero size-3 rounded-[3px]" />
          <MoneyText>{t("scheduled", { amount: formatEur(chart.scheduledTotal) })}</MoneyText>
        </span>
      )}
    </div>
  );
}

/**
 * The bars: money out (ember), the bills still due after today stacked on top (hatched),
 * an empty stub where nothing went out, and a thin line at today.
 */
function SpendChart({ chart, compact = false, className }: { chart: ActivitySpendChart; compact?: boolean; className?: string }) {
  const t = useTranslations("activity.summary.chart");
  const max = Math.max(1, ...chart.bars.map((b) => b.spent + b.scheduled));
  const todayAt = chart.todayIndex != null ? ((chart.todayIndex + 0.5) / chart.bars.length) * 100 : null;
  const label = [
    t("title", { unit: chart.unit }),
    t("average", { amount: formatEur(Math.round(chart.perDay)) }),
    chart.scheduledTotal > 0 ? t("scheduled", { amount: formatEur(chart.scheduledTotal) }) : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <div
      role="img"
      aria-label={label}
      className={cn("relative flex items-end", compact ? "gap-[1.5px]" : "gap-[3px] border-b border-clear-hero-ink/20", className)}
    >
      {chart.bars.map((b, i) => {
        const total = b.spent + b.scheduled;
        if (total <= 0) {
          return <span key={b.from} className="h-[6%] min-h-0.5 flex-1 rounded-t-[2px] bg-clear-hero-ink/15" />;
        }
        return (
          <span
            key={b.from}
            className={cn("flex min-h-[3px] flex-1 flex-col overflow-hidden", compact ? "rounded-t-[2px]" : "rounded-t-[4px]")}
            style={{ height: `${Math.max(6, (total / max) * 100)}%` }}
          >
            {b.scheduled > 0 && <span className="clear-hatch-hero" style={{ flex: b.scheduled }} />}
            {b.spent > 0 && <span className={cn("bg-clear-ember", !compact && i !== chart.todayIndex && "opacity-85")} style={{ flex: b.spent }} />}
          </span>
        );
      })}
      {todayAt != null && !compact && (
        <span aria-hidden className="absolute -top-1 bottom-0 w-px bg-clear-hero-ink/35" style={{ left: `${todayAt}%` }} />
      )}
    </div>
  );
}

/**
 * Beside the hero: Needs a category (peach, with Review) and Upcoming. With nothing to
 * review the review card goes and Upcoming lists the next three bills. Desktop stacks
 * them in the hero's column; phones show two tiles side by side, or one Upcoming row.
 */
export function ActivitySideCards({ tiles, layout }: { tiles: ActivityTiles; layout: "desktop" | "phone" }) {
  const t = useTranslations("activity.tiles");
  const locale = useLocale();
  const { upcoming, needsReview } = tiles;
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });
  const shortFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const noon = new Date().setHours(12, 0, 0, 0);
  const daysUntil = (d: string) => Math.round((iso(d).getTime() - noon) / 86_400_000);
  const hover = "transition-shadow hover:ring-2 hover:ring-clear-ink/10";

  if (layout === "phone") {
    if (needsReview) {
      return (
        <div className={cn("grid gap-2.5", upcoming && "grid-cols-2")}>
          <Link href="/transactions/needs-review" className="flex min-w-0 flex-col gap-0.5 rounded-clear-tile bg-clear-peach px-3.5 py-3 text-clear-ink no-underline">
            <span className="truncate text-[15px] font-extrabold">{t("toSort", { count: needsReview.count })}</span>
            <span className="inline-flex items-center gap-0.5 truncate text-xs text-clear-ink-2">
              {t("toSortSub")}
              <IconChevronRight aria-hidden className="size-3.5 shrink-0" stroke={2.2} />
            </span>
          </Link>
          {upcoming && (
            <Link href="/transactions/upcoming" className="flex min-w-0 flex-col gap-0.5 rounded-clear-tile bg-clear-card px-3.5 py-3 text-clear-ink no-underline">
              <span className="truncate text-[15px] font-extrabold">{t("upcoming", { count: upcoming.count })}</span>
              <span className="inline-flex min-w-0 items-center gap-0.5 text-xs text-clear-ink-2">
                <span className="truncate">
                  <MoneyText>{t("upcomingSub", { amount: formatEur(upcoming.total), date: upcoming.until })}</MoneyText>
                </span>
                <IconChevronRight aria-hidden className="size-3.5 shrink-0" stroke={2.2} />
              </span>
            </Link>
          )}
        </div>
      );
    }
    if (!upcoming) return null;
    const first = upcoming.next[0];
    return (
      <Link href="/transactions/upcoming" className="flex min-w-0 items-center gap-3 rounded-clear-tile bg-clear-card px-3.5 py-3 text-clear-ink no-underline">
        <IconTile tone="sky" className="size-10">
          <IconCalendarDue stroke={2} />
        </IconTile>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-extrabold">{t("upcoming", { count: upcoming.count })}</span>
          <span className="truncate text-[13px] text-clear-ink-2">
            <MoneyText>
              {first
                ? t("upcomingNext", { name: first.name, amount: formatEur(first.amount), date: shortFmt.format(iso(first.date)) })
                : t("upcomingSub", { amount: formatEur(upcoming.total), date: upcoming.until })}
            </MoneyText>
          </span>
        </span>
        <Amount value={upcoming.total} sign="none" splitCents={false} className="shrink-0 text-[15px]" />
      </Link>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {needsReview && (
        <Link
          href="/transactions/needs-review"
          className={cn("flex flex-1 flex-col justify-between gap-3 rounded-clear-card bg-clear-peach p-5 text-clear-ink no-underline", hover)}
        >
          <span className="flex items-center justify-between gap-3">
            <IconTile className="size-10 bg-clear-card text-clear-ember-text">
              <IconInbox stroke={2} />
            </IconTile>
            <span className="inline-flex h-8 items-center rounded-full bg-clear-primary px-3.5 text-[13px] font-bold text-clear-primary-ink">{t("review")}</span>
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[17px] font-extrabold">{t("needsReview", { count: needsReview.count })}</span>
            <span className="text-[13px] text-clear-ink-2">{t("needsReviewSub")}</span>
          </span>
        </Link>
      )}
      {upcoming && (
        <Link
          href="/transactions/upcoming"
          className={cn(
            "flex flex-col rounded-clear-card bg-clear-card text-clear-ink no-underline",
            needsReview ? "flex-1 justify-between gap-3 p-5" : "flex-1 gap-1.5 px-5 pt-5 pb-3",
            hover,
          )}
        >
          <span className={cn("flex items-center gap-3", !needsReview && "pb-1.5")}>
            <IconTile tone="sky" className="size-10">
              <IconCalendarDue stroke={2} />
            </IconTile>
            {!needsReview && <UpcomingTitle upcoming={upcoming} />}
          </span>
          {needsReview ? (
            <UpcomingTitle upcoming={upcoming} />
          ) : (
            upcoming.next.map((b) => {
              const days = daysUntil(b.date);
              return (
                <span key={b.id} className="flex min-h-[50px] items-center gap-3 border-t border-clear-line">
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-sm font-bold">{b.name}</span>
                    <span className={cn("truncate text-[13px] font-semibold", days <= 3 ? "text-clear-ember-text" : "text-clear-ink-2")}>
                      {t("dueIn", { date: dayFmt.format(iso(b.date)), days })}
                    </span>
                  </span>
                  <Amount value={b.amount} sign="none" splitCents={false} className="shrink-0 text-sm" />
                </span>
              );
            })
          )}
        </Link>
      )}
    </div>
  );
}

function UpcomingTitle({ upcoming }: { upcoming: NonNullable<ActivityTiles["upcoming"]> }) {
  const t = useTranslations("activity.tiles");
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[17px] font-extrabold">{t("upcoming", { count: upcoming.count })}</span>
      <span className="truncate text-[13px] text-clear-ink-2">
        <MoneyText>{t("upcomingSub", { amount: formatEur(upcoming.total), date: upcoming.until })}</MoneyText>
      </span>
    </span>
  );
}

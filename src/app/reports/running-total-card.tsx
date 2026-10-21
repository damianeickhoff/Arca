import { getTranslations } from "next-intl/server";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { MoneyText } from "@/components/clear/money";
import { formatEurWhole } from "@/lib/format";
import type { RunningTotals } from "@/lib/period-facts";
import { cn } from "@/lib/utils";

/**
 * Insights › Overview "This month against last": spending added up day by day, this
 * period solid up to today, the previous period grey over the whole length, a dotted
 * projection from today to the end, the budget as a thin ember dashed line with its
 * label, and the ember dot at today.
 *
 * The plot box carries its own minimum height and the SVG fills it absolutely, so the
 * chart never depends on a flex parent handing it space: beside the taller merchants
 * card it grows, on its own it is 140–200px. The SVG stretches (strokes keep their
 * width); the dot and the labels are HTML so they stay round and at their real size.
 */
export async function RunningTotalCard({
  totals,
  budget,
  ongoing,
  monthly,
  startLabel,
  endLabel,
  className,
}: {
  totals: RunningTotals;
  /** The budget for this period; null without one (see OverviewHero). */
  budget: number | null;
  /** The period includes today. */
  ongoing: boolean;
  /** The period is the running month, so it reads "This month against last". */
  monthly: boolean;
  /** The first and last day, formatted ("1 Oct"). */
  startLabel: string;
  endLabel: string;
  className?: string;
}) {
  const t = await getTranslations("insights.overview");
  const { days, elapsed, current, previous, projected } = totals;
  const spent = current[elapsed - 1] ?? 0;
  const previousTotal = previous[days - 1] ?? 0;
  const empty = spent <= 0 && previousTotal <= 0;

  // The plot in viewBox units; TOP keeps room above the highest line for the budget label.
  const W = 320;
  const H = 100;
  const TOP = 8;
  const ceiling = Math.max(1, previousTotal, projected ?? 0, budget ?? 0, spent) * 1.04;
  const x = (day: number) => (day / days) * W;
  const y = (v: number) => H - (v / ceiling) * (H - TOP);
  const points = (values: number[]) => [`0,${H}`, ...values.map((v, i) => `${x(i + 1)},${y(v)}`)].join(" ");
  const todayPct = (x(elapsed) / W) * 100;
  const budgetPct = budget != null ? (y(budget) / H) * 100 : null;
  const stroke = { fill: "none", strokeLinejoin: "round", strokeLinecap: "round", vectorEffect: "non-scaling-stroke" } as const;

  const label = t("runningTotal.chartLabel", {
    spent: formatEurWhole(spent),
    previous: totals.previousAtSameDay != null ? formatEurWhole(totals.previousAtSameDay) : "none",
    projected: projected != null ? formatEurWhole(projected) : "none",
  });

  return (
    <ClearCard aria-labelledby="insights-running-title" className={cn("gap-4", className)}>
      <ClearCardHeader
        title={<span id="insights-running-title">{monthly ? t("runningTotal.title") : t("runningTotal.titleOther")}</span>}
        subtitle={t("runningTotal.subtitle")}
      />

      {empty ? (
        <p className="m-0 flex min-h-[140px] flex-1 items-center justify-center text-center text-sm text-clear-muted">{t("noSpending")}</p>
      ) : (
        <>
          <div aria-hidden className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] font-semibold text-clear-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[3px] w-4 rounded-full bg-clear-ink" />
              {monthly ? t("runningTotal.thisMonth") : t("runningTotal.thisPeriod")}
            </span>
            {previousTotal > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[3px] w-4 rounded-full bg-clear-placeholder opacity-60" />
                {monthly ? t("runningTotal.lastMonth") : t("runningTotal.previousPeriod")}
              </span>
            )}
            {budget != null && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-clear-ember" />
                {t("runningTotal.budget")}
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-1.5">
            <div role="img" aria-label={label} data-tip-anchor="insightsRunningTotal" className="relative min-h-[140px] flex-1 sm:min-h-[180px] xl:min-h-[200px]">
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full overflow-visible">
                <line x1="0" y1={H} x2={W} y2={H} stroke="var(--clr-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                {budget != null && (
                  <line x1="0" y1={y(budget)} x2={W} y2={y(budget)} stroke="var(--clr-ember)" strokeWidth="1.5" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
                )}
                {previousTotal > 0 && <polyline points={points(previous)} stroke="var(--clr-placeholder)" strokeOpacity="0.6" strokeWidth="2" {...stroke} />}
                {projected != null && elapsed < days && (
                  <line x1={x(elapsed)} y1={y(spent)} x2={W} y2={y(projected)} stroke="var(--clr-ink)" strokeOpacity="0.55" strokeWidth="2.5" strokeDasharray="0.5 6" {...stroke} />
                )}
                {elapsed > 0 && <polyline points={points(current)} stroke="var(--clr-ink)" strokeWidth="2.5" {...stroke} />}
              </svg>
              {budget != null && budgetPct != null && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute right-0 rounded-full bg-clear-card px-1.5 text-xs font-semibold whitespace-nowrap text-clear-ember-text tabular-nums",
                    // Under the line when it runs along the top, above it otherwise.
                    budgetPct < 16 ? "translate-y-1" : "-translate-y-[calc(100%+4px)]",
                  )}
                  style={{ top: `${budgetPct}%` }}
                >
                  <MoneyText>{t("runningTotal.budgetLine", { amount: formatEurWhole(budget) })}</MoneyText>
                </span>
              )}
              {ongoing && elapsed > 0 && (
                <span
                  aria-hidden
                  className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-clear-ember ring-2 ring-clear-card"
                  style={{ left: `${todayPct}%`, top: `${(y(spent) / H) * 100}%` }}
                />
              )}
            </div>
            <div aria-hidden className="relative flex justify-between gap-3 text-xs text-clear-muted">
              <span>{startLabel}</span>
              {ongoing && todayPct > 15 && todayPct < 80 && (
                <span className="absolute -translate-x-1/2 font-semibold text-clear-ink" style={{ left: `${todayPct}%` }}>
                  {t("runningTotal.today")}
                </span>
              )}
              <span className="truncate">{endLabel}</span>
            </div>
          </div>
        </>
      )}
    </ClearCard>
  );
}

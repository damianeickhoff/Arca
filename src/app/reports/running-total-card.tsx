import { getTranslations } from "next-intl/server";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { MoneyText } from "@/components/clear/money";
import { formatEurWhole } from "@/lib/format";
import { runningTotalPlot, type RunningTotals } from "@/lib/period-facts";
import { cn } from "@/lib/utils";

/**
 * Insights › Overview "This month against last": spending added up day by day, this
 * period solid up to today, the previous period grey and dashed over the whole length,
 * a dotted projection from today to the end, the budget as a thin ember dashed line
 * with its label, and the ember dot at today.
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
  /** The budget for this period (see runningTotalBudget); `allSpending` when the lines
   *  are filtered and the budget still covers all spending. Null without one. */
  budget: { amount: number; allSpending: boolean } | null;
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
  const { elapsed, current, previous, projected } = totals;
  const spent = current[elapsed - 1] ?? 0;
  const empty = spent <= 0 && !previous.some((v) => v > 0);

  // The plot in viewBox units; TOP keeps room above the highest line for the budget label.
  const W = 320;
  const H = 100;
  const plot = runningTotalPlot(totals, { width: W, height: H, top: 8, budget: budget?.amount });
  const budgetPct = plot.budgetY != null ? (plot.budgetY / H) * 100 : null;
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
            {plot.previous && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 border-t-[3px] border-dashed border-clear-muted opacity-70" />
                {monthly ? t("runningTotal.lastMonth") : t("runningTotal.previousPeriod")}
              </span>
            )}
            {budget && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-clear-ember" />
                {budget.allSpending ? t("runningTotal.budgetAll") : t("runningTotal.budget")}
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-1.5">
            <div role="img" aria-label={label} data-tip-anchor="insightsRunningTotal" className="relative min-h-[140px] flex-1 sm:min-h-[180px] xl:min-h-[200px]">
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full overflow-visible">
                <line x1="0" y1={H} x2={W} y2={H} stroke="var(--clr-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                {plot.budgetY != null && (
                  <line x1="0" y1={plot.budgetY} x2={W} y2={plot.budgetY} stroke="var(--clr-ember)" strokeWidth="1.5" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
                )}
                {plot.previous && <polyline points={plot.previous} stroke="var(--clr-muted)" strokeOpacity="0.7" strokeWidth="2" strokeDasharray="5 4" {...stroke} />}
                {plot.projection && (
                  <line {...plot.projection} stroke="var(--clr-ink)" strokeOpacity="0.55" strokeWidth="2.5" strokeDasharray="0.5 6" {...stroke} />
                )}
                {plot.current && <polyline points={plot.current} stroke="var(--clr-ink)" strokeWidth="2.5" {...stroke} />}
              </svg>
              {budget && budgetPct != null && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute right-0 rounded-full bg-clear-card px-1.5 text-xs font-semibold whitespace-nowrap text-clear-ember-text tabular-nums",
                    // Under the line when it runs along the top, above it otherwise.
                    budgetPct < 16 ? "translate-y-1" : "-translate-y-[calc(100%+4px)]",
                  )}
                  style={{ top: `${budgetPct}%` }}
                >
                  <MoneyText>
                    {t(budget.allSpending ? "runningTotal.budgetLineAll" : "runningTotal.budgetLine", { amount: formatEurWhole(budget.amount) })}
                  </MoneyText>
                </span>
              )}
              {ongoing && plot.today && (
                <span
                  aria-hidden
                  className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-clear-ember ring-2 ring-clear-card"
                  style={{ left: `${plot.today.left}%`, top: `${plot.today.top}%` }}
                />
              )}
            </div>
            <div aria-hidden className="relative flex justify-between gap-3 text-xs text-clear-muted">
              <span>{startLabel}</span>
              {ongoing && plot.today && plot.today.left > 15 && plot.today.left < 80 && (
                <span className="absolute -translate-x-1/2 font-semibold text-clear-ink" style={{ left: `${plot.today.left}%` }}>
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

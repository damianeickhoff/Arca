import { getTranslations } from "next-intl/server";
import { Amount } from "@/components/clear/amount";
import { ClearCard } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { MoneyText } from "@/components/clear/money";
import { formatEurWhole } from "@/lib/format";
import type { RunningTotals } from "@/lib/period-facts";
import { cn } from "@/lib/utils";
import type { Change, SafeToSpendHint } from "./overview-cards";

/** A period named in a sentence: its month ("September", "Sep") or, for weeks and
 *  other ranges, "none", which the messages turn into "last period" / "the period". */
export interface PeriodName {
  long: string;
  short: string;
}

/**
 * Insights › Overview's answer card (black, two columns wide): what is spent so far,
 * how that compares with the previous period by the same day, where the period is
 * heading against the budget, and the running total as a line. Beside it four tiles:
 * income, saved, left to spend and the largest expense. The tiles are a 2×2 grid with
 * equal rows that stretch to the card's height; the chart takes what is left of the
 * left half's height.
 */
export async function OverviewHero({
  ongoing,
  month,
  previousMonth,
  spent,
  totals,
  budget,
  income,
  incomeChange,
  saved,
  savedPct,
  left,
  avgPerDay,
  largest,
  startLabel,
  endLabel,
  className,
}: {
  /** The period includes today. */
  ongoing: boolean;
  /** The month this period stands for; null for other ranges. */
  month: PeriodName | null;
  previousMonth: PeriodName | null;
  spent: number;
  totals: RunningTotals;
  /** The budget for this period; null without one, or when the period on screen
   *  isn't the budget period (or is filtered), so the two can't be compared. */
  budget: number | null;
  income: number;
  incomeChange: Change | null;
  saved: number;
  savedPct: number | null;
  left: SafeToSpendHint | null;
  avgPerDay: number;
  largest: { amount: number; name: string | null; date: string } | null;
  /** The first and last day, formatted ("1 Oct"). */
  startLabel: string;
  endLabel: string;
  className?: string;
}) {
  const t = await getTranslations("insights.overview");
  const period = month?.long ?? "none";
  const previous = previousMonth?.long ?? "none";
  const previousShort = previousMonth?.short ?? "none";
  const bold = (chunks: React.ReactNode) => <b className="font-semibold text-clear-hero-ink">{chunks}</b>;

  // The comparison chip: by the same day while the period runs, the whole period after.
  const difference = totals.difference;
  const compare =
    difference == null
      ? null
      : Math.abs(difference) < 1
        ? { good: true, text: t(ongoing ? "hero.sameSoFar" : "hero.same", { period: previous }) }
        : {
            good: difference < 0,
            text: t(`hero.${difference < 0 ? "less" : "more"}${ongoing ? "SoFar" : ""}`, { amount: formatEurWhole(Math.abs(difference)), period: previous }),
          };

  // Where the period ends at this pace, against the budget when there is one.
  const projected = totals.projected;
  const pace =
    projected == null
      ? null
      : budget == null
        ? t.rich("hero.pace", { period, amount: formatEurWhole(projected), b: bold })
        : projected <= budget
          ? t.rich("hero.paceInside", { period, amount: formatEurWhole(projected), budget: formatEurWhole(budget), b: bold })
          : t.rich("hero.paceOver", {
              period,
              amount: formatEurWhole(projected),
              over: formatEurWhole(projected - budget),
              budget: formatEurWhole(budget),
              b: bold,
            });

  const spentSoFar = totals.current[totals.elapsed - 1] ?? 0;
  const chartLabel = t("hero.chartLabel", {
    spent: formatEurWhole(spentSoFar),
    previous: totals.previousAtSameDay != null ? formatEurWhole(totals.previousAtSameDay) : "none",
    projected: projected != null ? formatEurWhole(projected) : "none",
  });

  const incomeChip = incomeChange
    ? incomeChange.pct === 0
      ? t("hero.incomeSame", { period: previousShort })
      : t("hero.incomeVs", { change: `${incomeChange.up ? "+" : "−"}${incomeChange.pct}%`, period: previousShort })
    : null;

  return (
    <ClearCard hero aria-labelledby="insights-hero-title" className={cn("gap-5", className)}>
      <div className="grid flex-1 gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-[22px]">
        <div className="flex min-w-0 flex-col">
          <h2 id="insights-hero-title" className="m-0 text-[13px] font-medium text-clear-hero-ink-2">
            {ongoing ? (month ? t("hero.soFarMonth") : t("hero.soFarPeriod")) : t("hero.thisPeriod")}
          </h2>
          <p className="m-0 mt-1.5 flex flex-wrap items-baseline gap-x-2">
            <Amount value={spent} whole className="text-[32px] font-bold! tracking-[-0.03em] lg:text-[40px]" />
            <span className="text-lg font-medium text-clear-hero-ink-2">{t("hero.spent")}</span>
          </p>
          {compare && (
            <div className="mt-2">
              <ClearChip tone={compare.good ? "mint" : "peach"} className="h-auto max-w-full py-1 text-xs font-semibold whitespace-normal">
                {compare.text}
              </ClearChip>
            </div>
          )}
          {pace && (
            <p className="m-0 mt-3 text-sm leading-normal text-clear-hero-ink-2">
              <MoneyText>{pace}</MoneyText>
            </p>
          )}
          <RunningTotalChart
            totals={totals}
            budget={budget}
            ongoing={ongoing}
            label={chartLabel}
            startLabel={startLabel}
            endLabel={budget != null ? t("hero.budgetLine", { date: endLabel }) : endLabel}
            todayLabel={t("hero.today")}
          />
        </div>

        <div className="grid grid-cols-2 grid-rows-2 gap-2.5">
          <HeroTile label={t("income")} value={income} chip={incomeChip} />
          <HeroTile label={t("saved")} value={saved} chip={savedPct != null ? t("hero.savedShare", { pct: savedPct }) : null} />
          {left ? (
            <HeroTile
              label={t("hero.leftToSpend")}
              value={left.amount}
              chip={left.amount > 0 ? t("hero.perDayDays", { amount: formatEurWhole(left.perDay), count: left.daysLeft }) : t("hero.daysToGo", { count: left.daysLeft })}
            />
          ) : (
            <HeroTile label={t("avgPerDay")} value={avgPerDay} chip={t("hero.overDays", { count: Math.max(1, totals.elapsed) })} />
          )}
          <HeroTile
            label={t("largest")}
            value={largest?.amount ?? 0}
            chip={largest ? (largest.name ? t("largestWhere", { name: largest.name, date: largest.date }) : largest.date) : null}
          />
        </div>
      </div>
    </ClearCard>
  );
}

/** One translucent tile on the hero: label on top, the amount and a chip at the bottom. */
function HeroTile({ label, value, chip }: { label: string; value: number; chip: string | null }) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-3 rounded-clear-tile bg-clear-hero-ink/8 px-4 py-3.5">
      <span className="truncate text-xs font-medium text-clear-hero-ink-2">{label}</span>
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <Amount value={value} whole className="text-[22px] font-bold! tracking-[-0.02em]" />
        {chip && (
          <span className="max-w-full truncate rounded-full bg-clear-hero-ink/12 px-2.5 py-[3px] text-xs font-semibold">
            <MoneyText>{chip}</MoneyText>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The running total: this period solid up to today, the previous period faded over the
 * whole length, the projection dotted from today to the end and the budget as a thin
 * ember dashed line, with the ember dot at today. The SVG stretches to the space it
 * gets (strokes keep their width), the dot is HTML so it stays round.
 */
function RunningTotalChart({
  totals,
  budget,
  ongoing,
  label,
  startLabel,
  endLabel,
  todayLabel,
}: {
  totals: RunningTotals;
  budget: number | null;
  ongoing: boolean;
  label: string;
  startLabel: string;
  endLabel: string;
  todayLabel: string;
}) {
  const { days, elapsed, current, previous, projected } = totals;
  const W = 320;
  const H = 100;
  const TOP = 6;
  const spent = current[elapsed - 1] ?? 0;
  const previousTotal = previous[days - 1] ?? 0;
  const ceiling = Math.max(1, previousTotal, projected ?? 0, budget ?? 0, spent) * 1.04;
  const x = (day: number) => (day / days) * W;
  const y = (v: number) => H - (v / ceiling) * (H - TOP);
  const points = (values: number[]) => [`0,${H}`, ...values.map((v, i) => `${x(i + 1)},${y(v)}`)].join(" ");
  const todayPct = (x(elapsed) / W) * 100;
  const stroke = { fill: "none", strokeLinejoin: "round", strokeLinecap: "round", vectorEffect: "non-scaling-stroke" } as const;

  return (
    <div className="mt-3 flex min-h-[120px] flex-1 flex-col gap-1.5" data-tip-anchor="insightsRunningTotal">
      <div role="img" aria-label={label} className="relative min-h-0 flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full overflow-visible">
          {budget != null && (
            <line x1="0" y1={y(budget)} x2={W} y2={y(budget)} stroke="var(--clr-ember)" strokeWidth="1.25" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          )}
          {previousTotal > 0 && <polyline points={points(previous)} stroke="var(--clr-hero-ink)" strokeOpacity="0.28" strokeWidth="2" {...stroke} />}
          {projected != null && elapsed < days && (
            <line
              x1={x(elapsed)}
              y1={y(spent)}
              x2={W}
              y2={y(projected)}
              stroke="var(--clr-hero-ink)"
              strokeOpacity="0.6"
              strokeWidth="1.5"
              strokeDasharray="3 4"
              {...stroke}
            />
          )}
          {elapsed > 0 && <polyline points={points(current)} stroke="var(--clr-hero-ink)" strokeWidth="2.5" {...stroke} />}
        </svg>
        {ongoing && elapsed > 0 && (
          <span
            aria-hidden
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-clear-ember"
            style={{ left: `${todayPct}%`, top: `${(y(spent) / H) * 100}%` }}
          />
        )}
      </div>
      <div aria-hidden className="relative flex justify-between gap-3 text-xs text-clear-hero-ink-2">
        <span>{startLabel}</span>
        {ongoing && todayPct > 18 && todayPct < 70 && (
          <span className="absolute -translate-x-1/2" style={{ left: `${todayPct}%` }}>
            {todayLabel}
          </span>
        )}
        <span className="truncate">{endLabel}</span>
      </div>
    </div>
  );
}

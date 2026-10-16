import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  IconChevronRight,
  IconCoins,
  IconCreditCard,
  IconFileUpload,
  IconInfoCircle,
  IconRepeat,
  IconTarget,
  IconUmbrella,
  IconWallet,
} from "@tabler/icons-react";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { currentFinancialMonth, financialMonthRangeByMonth, type FinancialMonthConfig } from "@/lib/date-range";
import { getFinancialHealth, getMonthTotals, type FinancialHealth, type MonthTotals } from "@/lib/financial-health-data";
import {
  EMERGENCY_FUND_TARGET,
  HEALTH_MAX_POINTS,
  HEALTH_STATES,
  INCOME_VARIATION_TARGET,
  RECURRING_RATIO_TARGET,
  SAVINGS_RATE_TARGET,
  type HealthCategoryKey,
  type HealthCategoryResult,
  type HealthStateKey,
} from "@/lib/financial-health";
import { getHealthHistory } from "@/lib/health-snapshots";
import { formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { ClearChip, DeltaChip } from "@/components/clear/chip";
import { ClearProgress } from "@/components/clear/progress";
import { IconTile } from "@/components/clear/icon-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import type { ClearTone } from "@/components/clear/tones";
import { AnchoredTip } from "@/components/anchored-tip";
import { MoneyText } from "@/components/clear/money";

// ─── Insights → Health ───────────────────────────────────────────────────────
//
// A high-level read on where the user's finances stand: one score (the hero gauge),
// the single step that would move it most, the six areas it is made of, and the
// score per budget month next to that month's income, expenses and net worth. No
// period picker and no per-transaction detail; the other Insights tabs own that.
// All scoring lives in lib/financial-health.ts and lib/financial-health-data.ts;
// this file only renders, and builds every sentence from the measured numbers so
// all of it goes through the translation files.

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Per area: its icon tile and where the next-step card sends the user. */
const AREA_META: Record<
  HealthCategoryKey,
  { icon: React.ComponentType<{ "aria-hidden"?: boolean }>; tone: ClearTone; links: [LinkKey, LinkKey] }
> = {
  savingsRate: { icon: IconTarget, tone: "sky", links: ["budget", "goals"] },
  emergencyFund: { icon: IconUmbrella, tone: "mint", links: ["goals", "budget"] },
  budgetAdherence: { icon: IconWallet, tone: "peach", links: ["budget", "trends"] },
  recurringExpenses: { icon: IconRepeat, tone: "stone", links: ["recurring", "budget"] },
  debtRatio: { icon: IconCreditCard, tone: "lilac", links: ["debts", "budget"] },
  incomeStability: { icon: IconCoins, tone: "butter", links: ["trends", "goals"] },
};

type LinkKey = "budget" | "goals" | "debts" | "recurring" | "trends";
const LINK_HREF: Record<LinkKey, string> = {
  budget: "/budget",
  goals: "/goals",
  debts: "/debts",
  recurring: "/settings?panel=recurring",
  trends: "/reports?tab=trends",
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const round1 = (v: number) => Math.round(v * 10) / 10;

/** The averages behind the metrics, so sentences can say "€650 a month" next to "16%".
 *  Same "active months only" rule as getHealthMetrics. */
function averages(health: FinancialHealth) {
  const active = health.monthTotals.filter((m) => m.income > 0 || m.expenses > 0);
  const n = active.length || 1;
  return {
    income: active.reduce((s, m) => s + m.income, 0) / n,
    expenses: active.reduce((s, m) => s + m.expenses, 0) / n,
  };
}
type Averages = ReturnType<typeof averages>;

/** The figure, its unit and the explanation an area card shows. */
function describeArea(cat: HealthCategoryResult, health: FinancialHealth, avg: Averages, t: Translate, decimal: (v: number) => string) {
  const m = health.metrics;
  if (cat.points === null) return { value: "—", unit: "", detail: t(`missing.${cat.key}`) };
  const count = m.monthsCovered;
  switch (cat.key) {
    case "savingsRate": {
      const v = m.savingsRate!;
      return {
        value: pct(v),
        unit: t("unit.ofIncome"),
        detail:
          v >= 0
            ? t("detail.savingsRate", { amount: formatEurWhole(v * avg.income), income: formatEurWhole(avg.income), count, target: pct(SAVINGS_RATE_TARGET), max: cat.maxPoints })
            : t("detail.savingsRateNegative", { amount: formatEurWhole(-v * avg.income), count }),
      };
    }
    case "emergencyFund": {
      const v = m.emergencyFundMonths!;
      return {
        value: decimal(v),
        unit: t("unit.months", { count: round1(v) }),
        detail: t("detail.emergencyFund", { amount: formatEurWhole(v * avg.expenses), months: round1(v), target: EMERGENCY_FUND_TARGET }),
      };
    }
    case "budgetAdherence": {
      const v = m.budgetAdherence!;
      return {
        value: pct(v),
        unit: t("unit.onBudget"),
        detail: v >= 0.99 ? t("detail.budgetAdherenceFull") : v <= 0 ? t("detail.budgetAdherenceOver") : t("detail.budgetAdherence", { pct: pct(1 - v) }),
      };
    }
    case "recurringExpenses": {
      const v = m.recurringRatio!;
      return {
        value: pct(v),
        unit: t("unit.ofIncome"),
        detail: t("detail.recurringExpenses", { amount: formatEurWhole(v * avg.income), target: pct(RECURRING_RATIO_TARGET) }),
      };
    }
    case "debtRatio": {
      const v = m.debtRatio!;
      return {
        value: pct(v),
        unit: t("unit.ofIncome"),
        detail: v <= 0 ? t("detail.debtRatioNone") : t("detail.debtRatio", { amount: formatEurWhole(v * avg.income) }),
      };
    }
    case "incomeStability": {
      const v = m.incomeVariation!;
      const steady = v <= INCOME_VARIATION_TARGET;
      return {
        value: steady ? t("unit.steady") : `±${pct(v)}`,
        unit: steady ? t("unit.monthlyIncome") : t("unit.monthToMonth"),
        detail: steady ? t("detail.incomeStabilitySteady") : t("detail.incomeStability", { pct: pct(v) }),
      };
    }
  }
}

/** Where the user is, where full points are, and what closes the gap — for the next-step card. */
function describePlan(key: HealthCategoryKey, health: FinancialHealth, avg: Averages, t: Translate) {
  const m = health.metrics;
  const perMonth = (v: number) => t("perMonth", { amount: formatEurWhole(v) });
  switch (key) {
    case "savingsRate": {
      const v = m.savingsRate ?? 0;
      return {
        title: t("action.savingsRate", { target: pct(SAVINGS_RATE_TARGET) }),
        now: pct(v),
        nowSub: v > 0 ? perMonth(v * avg.income) : null,
        target: pct(SAVINGS_RATE_TARGET),
        targetSub: perMonth(SAVINGS_RATE_TARGET * avg.income),
        gap: t("gap.savingsRate", { amount: formatEurWhole((SAVINGS_RATE_TARGET - v) * avg.income) }),
      };
    }
    case "emergencyFund": {
      const v = m.emergencyFundMonths ?? 0;
      return {
        title: t("action.emergencyFund", { count: EMERGENCY_FUND_TARGET }),
        now: t("monthsCount", { count: round1(v) }),
        nowSub: formatEurWhole(v * avg.expenses),
        target: t("monthsCount", { count: EMERGENCY_FUND_TARGET }),
        targetSub: formatEurWhole(EMERGENCY_FUND_TARGET * avg.expenses),
        gap: t("gap.emergencyFund", { amount: formatEurWhole((EMERGENCY_FUND_TARGET - v) * avg.expenses) }),
      };
    }
    case "budgetAdherence":
      return {
        title: t("action.budgetAdherence"),
        now: pct(m.budgetAdherence ?? 0),
        nowSub: null,
        target: pct(1),
        targetSub: null,
        gap: t("gap.budgetAdherence"),
      };
    case "recurringExpenses": {
      const v = m.recurringRatio ?? 0;
      return {
        title: t("action.recurringExpenses", { target: pct(RECURRING_RATIO_TARGET) }),
        now: pct(v),
        nowSub: perMonth(v * avg.income),
        target: pct(RECURRING_RATIO_TARGET),
        targetSub: perMonth(RECURRING_RATIO_TARGET * avg.income),
        gap: t("gap.recurringExpenses", { amount: formatEurWhole((v - RECURRING_RATIO_TARGET) * avg.income) }),
      };
    }
    case "debtRatio": {
      const v = m.debtRatio ?? 0;
      return {
        title: t("action.debtRatio"),
        now: pct(v),
        nowSub: perMonth(v * avg.income),
        target: pct(0),
        targetSub: null,
        gap: t("gap.debtRatio", { amount: formatEurWhole(v * avg.income) }),
      };
    }
    case "incomeStability":
      return {
        title: t("action.incomeStability"),
        now: `±${pct(m.incomeVariation ?? 0)}`,
        nowSub: null,
        target: `±${pct(INCOME_VARIATION_TARGET)}`,
        targetSub: null,
        gap: t("gap.incomeStability"),
      };
  }
}

/** Good from 80% of an area's points, fair from 50%, else it needs work. */
function areaStatus(ratio: number | null): { key: "good" | "fair" | "weak" | "none"; tone: ClearTone } {
  if (ratio == null) return { key: "none", tone: "neutral" };
  return ratio >= 0.8 ? { key: "good", tone: "mint" } : ratio >= 0.5 ? { key: "fair", tone: "butter" } : { key: "weak", tone: "peach" };
}

export async function HealthTab() {
  const financialMonth = await getFinancialMonthConfig();
  const currentMonth = currentFinancialMonth(financialMonth);
  const [health, history, tRaw, locale] = await Promise.all([
    getFinancialHealth(financialMonth),
    getHealthHistory(12),
    getTranslations("insights.health"),
    getLocale(),
  ]);
  const t = tRaw as Translate;
  const dateLocale = locale === "nl" ? "nl-NL" : "en-GB";
  const monthName = (ym: string, opts: Intl.DateTimeFormatOptions = { month: "long" }) =>
    new Date(`${ym}-15T12:00:00`).toLocaleDateString(dateLocale, opts);

  if (health.score === null || health.state === null) return <EmptyHealth />;

  const score = Math.max(0, Math.min(100, Math.round(health.score)));
  const avg = averages(health);
  const decimal = (v: number) => new Intl.NumberFormat(dateLocale, { maximumFractionDigits: 1 }).format(round1(v));

  // The score's movement since the last recorded month before this one.
  const prev = [...history].reverse().find((h) => h.month < currentMonth) ?? null;
  const prevScore = prev ? Math.round(prev.score) : null;
  const delta = prevScore == null ? null : score - prevScore;
  const recent = history.slice(-6);

  const top = health.opportunities[0] ?? null;
  const measured = health.categories.filter((c) => c.available).length;

  // Per-month income and expenses for the history table, on the same rules as the score.
  const historyMonths = [...new Set([...history.map((h) => h.month), currentMonth])].sort();
  const totals = new Map<string, MonthTotals>((await getMonthTotals(historyMonths, financialMonth)).map((m) => [m.month, m]));

  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      {/* 1. The score: gauge, state, movement since last month and the recent trend. */}
      <ClearCard hero aria-labelledby="health-hero-title" className={cn("flex-row flex-wrap items-center gap-7 lg:col-span-2", top ? "xl:col-span-2" : "xl:col-span-3")}>
        <div className="mx-auto flex min-w-0 flex-[0_1_260px] flex-col items-center gap-2.5">
          <ScoreGauge
            score={score}
            prev={prevScore}
            prevLabel={prev && prevScore != null ? t("marker", { month: monthName(prev.month, { month: "short" }), score: prevScore }) : null}
            outOf={t("outOf", { max: HEALTH_MAX_POINTS })}
            ariaLabel={
              prev && prevScore != null
                ? t("gaugeLabelPrev", { score, max: HEALTH_MAX_POINTS, prev: prevScore, month: monthName(prev.month) })
                : t("gaugeLabel", { score, max: HEALTH_MAX_POINTS })
            }
          />
          <StateBands current={health.state.key} t={t} />
        </div>

        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-3.5">
          <h2 id="health-hero-title" className="m-0 text-[17px] font-bold">{t("title")}</h2>
          <span className="text-[44px] leading-none font-extrabold tracking-[-0.035em] lg:text-[52px]">{t(`states.${health.state.key}`)}</span>
          {delta != null && prev && (
            delta === 0 ? (
              <ClearChip tone="stone" className="self-start">{t("same", { month: monthName(prev.month) })}</ClearChip>
            ) : (
              <DeltaChip direction={delta > 0 ? "up" : "down"} good={delta > 0} className="self-start">
                {t("since", { count: Math.abs(delta), month: monthName(prev.month) })}
              </DeltaChip>
            )
          )}
          <p className="m-0 text-base leading-normal text-clear-hero-ink-2">
            {top ? t("focus", { area: t(`area.${top.key}`) }) : t("allFull")}
            {measured < health.categories.length && <> {t("partial", { count: measured, total: health.categories.length })}</>}
          </p>
          {recent.length >= 2 && <ScoreTrend recent={recent.map((h) => ({ month: h.month, score: Math.round(h.score) }))} currentMonth={currentMonth} monthName={monthName} t={t} />}
        </div>
      </ClearCard>

      {/* 2. The one change that would lift the score most. */}
      {top && (
        <NextStepCard
          catKey={top.key}
          potential={top.potential}
          ratio={health.categories.find((c) => c.key === top.key)?.ratio ?? 0}
          plan={describePlan(top.key, health, avg, t)}
          t={t}
        />
      )}

      {/* 3. The areas the score is made of. Unmeasurable areas stay listed. */}
      <div className="col-span-full flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pt-2">
        <h2 className="m-0 text-[22px] font-extrabold tracking-[-0.02em]">{t("areasTitle")}</h2>
        <span className="text-sm text-clear-ink-2">{t("areasSubtitle", { count: health.categories.length, points: HEALTH_MAX_POINTS })}</span>
      </div>
      {health.categories.map((cat) => (
        <AreaCard key={cat.key} cat={cat} {...describeArea(cat, health, avg, t, decimal)} t={t} />
      ))}

      {/* 4. The score per budget month, next to that month's money. */}
      {history.length > 0 && (
        <HistoryCard
          history={history}
          totals={totals}
          currentMonth={currentMonth}
          financialMonth={financialMonth}
          scoredCount={history.length}
          dateLocale={dateLocale}
          monthName={monthName}
          t={t}
        />
      )}

      <AnchoredTip id="insightsHealthNextStep" anchor="insightsHealthNextStep" active={top != null} />
      <AnchoredTip id="insightsHealthHistory" anchor="insightsHealthHistory" active={history.length > 0} />
    </div>
  );
}

// ─── Hero pieces ─────────────────────────────────────────────────────────────

const GAUGE = { cx: 150, cy: 160, r: 120 };

/** Point on the gauge's half circle for a 0–100 score, at radius r. */
function gaugePoint(score: number, r: number) {
  const a = Math.PI * (1 - score / 100);
  return { x: GAUGE.cx + r * Math.cos(a), y: GAUGE.cy - r * Math.sin(a), cos: Math.cos(a) };
}

/**
 * The half-circle gauge on the hero, with a tick for last month's score. Drawn at most
 * 230px wide (about 0.77 of the viewBox), so the small labels use 16–18 units to stay
 * at 12px or more on screen.
 */
function ScoreGauge({ score, prev, prevLabel, outOf, ariaLabel }: { score: number; prev: number | null; prevLabel: string | null; outOf: string; ariaLabel: string }) {
  const arc = `M${GAUGE.cx - GAUGE.r} ${GAUGE.cy} A${GAUGE.r} ${GAUGE.r} 0 0 1 ${GAUGE.cx + GAUGE.r} ${GAUGE.cy}`;
  const tick = prev == null ? null : { from: gaugePoint(prev, 100), to: gaugePoint(prev, 140), label: gaugePoint(prev, 148) };
  const anchor = tick ? (tick.label.cos > 0.25 ? "start" : tick.label.cos < -0.25 ? "end" : "middle") : "middle";
  return (
    <svg viewBox="0 0 300 190" className="block h-auto w-full max-w-[230px] overflow-visible" role="img" aria-label={ariaLabel}>
      <path d={arc} fill="none" stroke="var(--clr-hero-ink)" strokeOpacity={0.12} strokeWidth={22} strokeLinecap="round" />
      {score > 0 && <path d={arc} fill="none" stroke="var(--clr-ember)" strokeWidth={22} strokeLinecap="round" pathLength={100} strokeDasharray={`${score} 100`} />}
      {tick && (
        <>
          <line x1={tick.from.x} y1={tick.from.y} x2={tick.to.x} y2={tick.to.y} stroke="var(--clr-hero-ink)" strokeOpacity={0.7} strokeWidth={2.5} strokeLinecap="round" />
          {prevLabel && (
            <text x={tick.label.x} y={tick.label.y + (anchor === "middle" ? -4 : 4)} textAnchor={anchor} fontSize={16} fontWeight={700} fill="var(--clr-hero-ink-2)">
              {prevLabel}
            </text>
          )}
        </>
      )}
      <text x={150} y={138} textAnchor="middle" fontSize={76} fontWeight={800} letterSpacing={-3} fill="var(--clr-hero-ink)" style={{ fontVariantNumeric: "tabular-nums" }}>
        {score}
      </text>
      <text x={150} y={168} textAnchor="middle" fontSize={18} fontWeight={600} fill="var(--clr-hero-ink-2)">{outOf}</text>
      <text x={30} y={190} textAnchor="middle" fontSize={16} fill="var(--clr-hero-ink-2)">0</text>
      <text x={270} y={190} textAnchor="middle" fontSize={16} fill="var(--clr-hero-ink-2)">100</text>
    </svg>
  );
}

/** "0–49 Needs attention · 50–74 Fair · …" under the gauge, the current band bright. */
function StateBands({ current, t }: { current: HealthStateKey; t: Translate }) {
  const bands = [...HEALTH_STATES].sort((a, b) => a.min - b.min);
  return (
    <div className="flex flex-wrap justify-center gap-x-3.5 gap-y-1.5 text-xs font-semibold text-clear-hero-ink-2">
      {bands.map((s, i) => {
        const next = bands[i + 1];
        const label = t(`states.${s.key}`);
        return (
          <span key={s.key} className={cn(s.key === current && "text-clear-hero-ink")}>
            {next ? t("band", { from: s.min, to: next.min - 1, label }) : t("bandTop", { from: s.min, label })}
          </span>
        );
      })}
    </div>
  );
}

/** The last few recorded scores as small bars, the month in progress in ember. */
function ScoreTrend({
  recent,
  currentMonth,
  monthName,
  t,
}: {
  recent: { month: string; score: number }[];
  currentMonth: string;
  monthName: (ym: string, opts?: Intl.DateTimeFormatOptions) => string;
  t: Translate;
}) {
  const lo = Math.min(...recent.map((r) => r.score));
  const hi = Math.max(...recent.map((r) => r.score));
  const height = (s: number) => (hi > lo ? 32 + (32 * (s - lo)) / (hi - lo) : 48);
  const list = recent.map((r) => `${monthName(r.month, { month: "short" })} ${r.score}`).join(", ");
  return (
    <div role="img" aria-label={t("trendLabel", { list })} className="flex items-end gap-2.5 pt-1.5">
      {recent.map((r) => (
        <span key={r.month} aria-hidden className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-[13px] font-extrabold tabular-nums">{r.score}</span>
          <span
            className={cn("block w-full rounded-lg", r.month === currentMonth ? "bg-clear-ember" : "bg-clear-hero-ink/20")}
            style={{ height: height(r.score) }}
          />
          <span className="text-xs text-clear-hero-ink-2">{monthName(r.month, { month: "short" })}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Next best step ──────────────────────────────────────────────────────────

function NextStepCard({
  catKey,
  potential,
  ratio,
  plan,
  t,
}: {
  catKey: HealthCategoryKey;
  potential: number;
  ratio: number;
  plan: ReturnType<typeof describePlan>;
  t: Translate;
}) {
  const [primary, secondary] = AREA_META[catKey].links;
  return (
    <ClearCard data-tip-anchor="insightsHealthNextStep" aria-labelledby="health-step-title" className="gap-4 bg-clear-peach text-clear-ink lg:col-span-2 xl:col-span-1">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2.5 text-[15px] font-bold">
          <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-full bg-clear-card">
            <IconTarget size={20} stroke={1.9} />
          </span>
          {t("nextStep")}
        </span>
        <ClearChip className="bg-clear-card text-clear-ink">{t("gain", { count: potential })}</ClearChip>
      </div>
      <div className="flex flex-col gap-2">
        <h2 id="health-step-title" className="m-0 text-[26px] leading-[1.15] font-extrabold tracking-[-0.02em] lg:text-[28px]">{plan.title}</h2>
        <span className="text-base text-clear-ink-2">{t("potential", { count: potential })}</span>
      </div>
      <div className="flex flex-col gap-2.5 rounded-clear-tile bg-clear-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm text-clear-ink-2">
          <span>
            {t("now")} <b className="text-base font-extrabold text-clear-ink">{plan.now}</b>
            {plan.nowSub && <> · <MoneyText>{plan.nowSub}</MoneyText></>}
          </span>
          <span>
            {t("target")} <b className="text-base font-extrabold text-clear-ink">{plan.target}</b>
            {plan.targetSub && <> · <MoneyText>{plan.targetSub}</MoneyText></>}
          </span>
        </div>
        <ClearProgress value={ratio} hatchRemainder />
        <span className="text-[13px] font-bold text-clear-ember-text"><MoneyText>{plan.gap}</MoneyText></span>
      </div>
      <div className="mt-auto flex flex-wrap gap-2.5">
        <Link href={LINK_HREF[primary]} className={clearButtonVariants()}>
          {t(`links.${primary}`)}
          <IconChevronRight aria-hidden className="size-4" />
        </Link>
        <Link href={LINK_HREF[secondary]} className={clearButtonVariants({ variant: "surface" })}>
          {t(`links.${secondary}`)}
        </Link>
      </div>
    </ClearCard>
  );
}

// ─── Areas ───────────────────────────────────────────────────────────────────

function AreaCard({ cat, value, unit, detail, t }: { cat: HealthCategoryResult; value: string; unit: string; detail: string; t: Translate }) {
  const meta = AREA_META[cat.key];
  const Icon = meta.icon;
  const status = areaStatus(cat.ratio);
  const titleId = `health-area-${cat.key}`;
  return (
    <ClearCard aria-labelledby={titleId} className="gap-4 p-[22px]">
      <div className="flex items-center gap-3">
        <IconTile tone={meta.tone}>
          <Icon aria-hidden />
        </IconTile>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 id={titleId} className="m-0 truncate text-base font-bold">{t(`area.${cat.key}`)}</h3>
          <span className="text-[13px] text-clear-muted">{t("upTo", { count: cat.maxPoints })}</span>
        </div>
        <ClearChip tone={status.tone}>{t(`status.${status.key}`)}</ClearChip>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="inline-flex min-w-0 items-baseline gap-2">
          <span className={cn("clear-amount text-[34px]", cat.points === null && "text-clear-placeholder")}>{value}</span>
          {unit && <span className="truncate text-sm font-semibold text-clear-ink-2">{unit}</span>}
        </span>
        {cat.points !== null && (
          <span className="text-[15px] font-extrabold whitespace-nowrap tabular-nums">{t("pts", { points: cat.points, max: cat.maxPoints })}</span>
        )}
      </div>
      <ClearProgress value={cat.ratio ?? 0} className="h-2.5" />
      <p className="m-0 text-sm leading-normal text-clear-ink-2"><MoneyText>{detail}</MoneyText></p>
    </ClearCard>
  );
}

// ─── Monthly history ─────────────────────────────────────────────────────────

const HISTORY_COLS = "grid grid-cols-[minmax(170px,1.3fr)_minmax(220px,1.8fr)_repeat(4,minmax(110px,1fr))] items-center gap-3 px-3.5";

function HistoryCard({
  history,
  totals,
  currentMonth,
  financialMonth,
  scoredCount,
  dateLocale,
  monthName,
  t,
}: {
  history: { month: string; score: number; netWorth: number | null }[];
  totals: Map<string, MonthTotals>;
  currentMonth: string;
  financialMonth: FinancialMonthConfig;
  scoredCount: number;
  dateLocale: string;
  monthName: (ym: string, opts?: Intl.DateTimeFormatOptions) => string;
  t: Translate;
}) {
  const short = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" });
  const rows = history.map((h, i) => {
    const score = Math.round(h.score);
    const change = i > 0 ? score - Math.round(history[i - 1].score) : null;
    const tot = totals.get(h.month);
    const has = tot != null && (tot.income > 0 || tot.expenses > 0);
    return {
      month: h.month,
      score,
      change,
      range: financialMonthRangeByMonth(h.month, financialMonth),
      current: h.month === currentMonth,
      income: has ? tot.income : null,
      expenses: has ? tot.expenses : null,
      rate: has && tot.income > 0 ? (tot.income - tot.expenses) / tot.income : null,
      over: has && tot.expenses > tot.income,
      netWorth: h.netWorth,
    };
  });
  const closesOn = financialMonthRangeByMonth(currentMonth, financialMonth).to;
  const overMonths = rows.filter((r) => r.over).map((r) => monthName(r.month));
  const list = new Intl.ListFormat(dateLocale, { type: "conjunction" });

  return (
    <ClearCard data-tip-anchor="insightsHealthHistory" aria-labelledby="health-history-title" className="col-span-full">
      <ClearCardHeader
        title={<span id="health-history-title">{t("history")}</span>}
        subtitle={t("historySubtitle", { day: financialMonth.defaultStartDay })}
        action={
          <Link href={LINK_HREF.trends} className={clearButtonVariants({ variant: "secondary", size: "sm" })}>
            {t("links.trends")}
            <IconChevronRight aria-hidden />
          </Link>
        }
      />
      <div className="-mx-2 overflow-x-auto px-2">
        <div role="table" aria-labelledby="health-history-title" className="flex min-w-[900px] flex-col">
          <div role="row" className={cn(HISTORY_COLS, "h-11 rounded-clear-row bg-clear-tile text-[13px] font-bold text-clear-ink-2")}>
            <span role="columnheader">{t("month")}</span>
            <span role="columnheader">{t("score")}</span>
            <span role="columnheader" className="text-right">{t("income")}</span>
            <span role="columnheader" className="text-right">{t("expenses")}</span>
            <span role="columnheader" className="text-right">{t("savingsRate")}</span>
            <span role="columnheader" className="text-right">{t("netWorth")}</span>
          </div>
          {rows.map((r) => (
            <div key={r.month} role="row" className={cn(HISTORY_COLS, "min-h-16 border-b border-clear-line py-2 text-[15px] last:border-b-0")}>
              <span role="cell" className="flex min-w-0 flex-col">
                <span className="inline-flex items-center gap-2 font-bold">
                  <span className="inline-block first-letter:uppercase">{monthName(r.month)}</span>
                  {r.current && <ClearChip tone="butter" className="h-6 px-2.5 text-xs font-bold">{t("soFar")}</ClearChip>}
                </span>
                <span className="text-[13px] text-clear-muted">{t("range", { from: short(r.range.from), to: short(r.range.to) })}</span>
              </span>
              <span role="cell" className="flex items-center gap-3">
                <span className="w-7 font-extrabold tabular-nums">{r.score}</span>
                <ClearProgress value={r.score / 100} className="h-2 flex-1" fillClassName={r.current ? undefined : "bg-clear-placeholder"} />
                {r.change != null && (
                  <ClearChip
                    tone={r.change > 0 ? "mint" : r.change < 0 ? "peach" : "neutral"}
                    className={cn("h-6 px-2 text-xs", r.change < 0 && "text-clear-negative")}
                  >
                    {r.change > 0 ? `+${r.change}` : r.change < 0 ? `−${-r.change}` : "±0"}
                  </ClearChip>
                )}
              </span>
              <span role="cell" className="text-right font-bold tabular-nums"><MoneyText>{r.income == null ? "—" : formatEurWhole(r.income)}</MoneyText></span>
              <span role="cell" className={cn("text-right font-bold tabular-nums", r.over && "text-clear-negative")}>
                <MoneyText>{r.expenses == null ? "—" : formatEurWhole(r.expenses)}</MoneyText>
              </span>
              <span role="cell" className="text-right font-bold tabular-nums">{r.rate == null ? "—" : pct(r.rate)}</span>
              <span role="cell" className="text-right font-extrabold tabular-nums"><MoneyText>{r.netWorth == null ? "—" : formatEurWhole(r.netWorth)}</MoneyText></span>
            </div>
          ))}
        </div>
      </div>
      <p className="m-0 flex items-start gap-2 text-[13px] text-clear-muted">
        <IconInfoCircle aria-hidden className="mt-px size-4 shrink-0" />
        <span>
          {t("closes", { month: monthName(currentMonth), date: short(closesOn) })}
          {overMonths.length > 0 && <> {t("overspent", { months: list.format(overMonths) })}</>}
          {scoredCount < 2 && <> {t("trendLater")}</>}
        </span>
      </p>
    </ClearCard>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

async function EmptyHealth() {
  const t = await getTranslations("insights.health.empty");
  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      <ClearCard aria-labelledby="health-empty-title" className="col-span-full items-center gap-6 px-5 py-10 text-center lg:px-8 lg:py-12">
        <GaugeIllustration />
        <div className="flex flex-col items-center gap-2.5">
          <h2 id="health-empty-title" className="m-0 text-[22px] font-extrabold tracking-[-0.02em] lg:text-2xl">{t("title")}</h2>
          <p className="m-0 max-w-[500px] text-[15px] leading-normal text-clear-ink-2 lg:text-base">{t("body")}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2.5">
          <Link href="/import" className={clearButtonVariants({ size: "lg" })}>
            <IconFileUpload aria-hidden />
            {t("import")}
          </Link>
          <Link href="/settings?panel=accounts" className={clearButtonVariants({ variant: "secondary", size: "lg" })}>
            {t("accounts")}
          </Link>
        </div>
      </ClearCard>
    </div>
  );
}

/** A dashed, empty gauge on a pastel disc — the empty-state shape. */
function GaugeIllustration() {
  return (
    <svg width="240" height="170" viewBox="0 0 240 170" fill="none" aria-hidden>
      <circle cx="120" cy="96" r="72" fill="var(--clr-lilac)" />
      <path d="M44 132 A76 76 0 0 1 196 132" stroke="var(--clr-card)" strokeWidth="18" strokeLinecap="round" />
      <path d="M44 132 A76 76 0 0 1 196 132" stroke="var(--clr-placeholder)" strokeWidth="2.2" strokeDasharray="5 5" strokeLinecap="round" />
      <path d="M44 132 A76 76 0 0 1 64 80" stroke="var(--clr-ember)" strokeWidth="18" strokeLinecap="round" />
      <path d="M120 132 L150 92" stroke="var(--clr-ink)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="120" cy="132" r="7" fill="var(--clr-card)" stroke="var(--clr-ink)" strokeWidth="2.5" />
      <circle cx="206" cy="40" r="6" fill="var(--clr-ember)" />
      <circle cx="32" cy="56" r="5" fill="var(--clr-mint)" stroke="var(--clr-ink)" strokeWidth="2" />
    </svg>
  );
}

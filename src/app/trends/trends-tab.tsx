import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { IconChartBar, IconFileImport, IconTrendingUp } from "@tabler/icons-react";
import { Amount } from "@/components/clear/amount";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { MoneyText } from "@/components/clear/money";
import { AnchoredTip } from "@/components/anchored-tip";
import { currentFinancialMonth, financialMonthForDate, financialMonthRangeByMonth, offsetFinancialMonth, type FinancialMonthConfig } from "@/lib/date-range";
import { formatEurWhole } from "@/lib/format";
import { parseTrendsRange, trendsMonths } from "@/lib/trends";
import { cn } from "@/lib/utils";
import { loadTrends, type TrendsData } from "./load-trends";
import { SpendingChart, type SpendingFocus } from "./spending-chart";
import { ExpensesTable, type ExpenseRow } from "./expenses-table";
import { CompareMonthsDialog } from "./compare-months-dialog";
import { TrendsPeriodControl, type CustomMonth } from "./trends-period-control";

/** Sign first with a real minus: "+€151", "−€55". */
function signed(v: number) {
  const r = Math.round(v);
  return `${r < 0 ? "−" : r > 0 ? "+" : ""}${formatEurWhole(Math.abs(r))}`;
}

const MAX_BILL_NAMES = 4;
const CUSTOM_MONTHS = 36;

/**
 * Insights › Trends, per budget month: what you keep per month as the hero, income and
 * expenses, the needs / wants / savings split against the plan, one chart of spending
 * against income, the biggest movers against the months before, and every category as
 * a table that scrolls inside its card. The period is `range=3|6|12` or a `from`/`to`
 * pair in the URL; its control (<TrendsPeriodSlot>) sits in the Insights tab row.
 */
export async function TrendsTab({
  range: rangeParam,
  from,
  to,
  cmpA,
  cmpB,
  categoryIds,
  accounts,
  financialMonth,
}: {
  /** The raw URL values (not the period cookie). */
  range?: string;
  from?: string;
  to?: string;
  cmpA?: string;
  cmpB?: string;
  categoryIds?: number[];
  accounts?: string[];
  financialMonth: FinancialMonthConfig;
}) {
  const range = parseTrendsRange({ range: rangeParam, from, to });
  const [data, t, locale] = await Promise.all([
    loadTrends({ range, cmpA, cmpB, categoryIds, accounts, financialMonth }),
    getTranslations("insights.trendsTab"),
    getLocale(),
  ]);

  // A budget month is named after the month it ends in, like the Budget page: 25 Sep –
  // 24 Oct is October.
  const endOf = (ym: string) => new Date(`${financialMonthRangeByMonth(ym, financialMonth).to}T12:00:00`);
  const short = (ym: string) => new Intl.DateTimeFormat(locale, { month: "short" }).format(endOf(ym));
  const long = (ym: string) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(endOf(ym));
  const name = (ym: string) => new Intl.DateTimeFormat(locale, { month: "long" }).format(endOf(ym));
  const dayMonth = (date: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
  const span = (months: string[]) => (months.length === 0 ? "" : months.length === 1 ? short(months[0]) : `${short(months[0])} – ${short(months.at(-1)!)}`);

  if (!data.hasAnyTransaction) return <TrendsEmpty />;

  const { summary, months, running } = data;
  const runningIndex = running ? months.indexOf(running) : null;
  const basisMonths = summary.basis.map((f) => f.month);
  const currentLabel = running ? t("table.currentSoFar", { month: short(running) }) : null;
  const beforeSpan = span(data.before);

  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      <KeptHero data={data} t={t} short={short} />

      {/* Income and expenses side by side, per finished month. */}
      <ClearCard aria-label={t("averages")} className="grid grid-cols-2 gap-3.5 px-5 py-[18px]">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-semibold text-clear-ink-2">{t("avgIncome")}</span>
          <span className="flex items-baseline gap-0.5">
            <Amount value={summary.avgIncome} whole className="text-[22px] font-bold! tracking-[-0.02em]" />
            <span className="text-[13px] font-semibold text-clear-placeholder">{t("perMonth")}</span>
          </span>
          <span className="truncate text-xs text-clear-muted">
            <MoneyText>
              {data.incomeNote
                ? t("incomeNote", { name: data.incomeNote.name, month: name(data.incomeNote.month) })
                : summary.peakIncome
                  ? t("highest", { month: short(summary.peakIncome.month), amount: formatEurWhole(summary.peakIncome.income) })
                  : t("noIncome")}
            </MoneyText>
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-semibold text-clear-ink-2">{t("avgExpenses")}</span>
          <span className="flex items-baseline gap-0.5">
            <Amount value={summary.avgExpense} whole className="text-[22px] font-bold! tracking-[-0.02em]" />
            <span className="text-[13px] font-semibold text-clear-placeholder">{t("perMonth")}</span>
          </span>
          <span className="truncate text-xs text-clear-muted">
            <MoneyText>
              {summary.peakExpense ? t("highest", { month: short(summary.peakExpense.month), amount: formatEurWhole(summary.peakExpense.expense) }) : t("noExpenses")}
            </MoneyText>
          </span>
        </div>
      </ClearCard>

      <SplitCard data={data} t={t} className="lg:col-span-2 xl:col-span-1" />

      {/* One chart: spending stacked against income, a chip per group or category. */}
      <ClearCard aria-labelledby="trends-chart-title" className="gap-3 lg:col-span-2">
        <ClearCardHeader
          title={<span id="trends-chart-title">{t("chartTitle")}</span>}
          subtitle={t("chartSubtitle")}
          action={
            <span aria-hidden className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs font-semibold text-clear-ink-2">
              <span className="inline-flex items-center gap-1.5"><span className="size-[9px] rounded-[3px] bg-clear-ink" />{t("chart.needs")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-[9px] rounded-[3px] bg-clear-placeholder" />{t("chart.wants")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-[2.2px] w-4 rounded-full bg-clear-positive" />{t("chart.income")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-[1.5px] border-dashed border-clear-placeholder" />{t("chart.avgSpend")}</span>
            </span>
          }
        />
        <SpendingChart
          months={months.map((m) => ({ key: m, short: short(m), long: long(m) }))}
          runningIndex={runningIndex}
          focuses={chartFocuses(data, t)}
          income={data.flows.map((f) => f.income)}
          expectedIncome={running ? (data.flows.at(-1)?.income ?? 0) + data.pendingIncome.reduce((s, p) => s + p.amount, 0) : null}
          dueLabel={data.pendingIncome[0] ? t("dueLabel", { name: data.pendingIncome[0].name, date: dayMonth(data.pendingIncome[0].dueDate) }) : null}
          incomeNote={data.incomeNote && months.includes(data.incomeNote.month) ? { index: months.indexOf(data.incomeNote.month), label: data.incomeNote.name } : null}
          avgSpend={summary.avgExpense}
          description={t("chartDescription", {
            months: data.flows.map((f) => `${short(f.month)}: ${formatEurWhole(f.expense)} / ${formatEurWhole(f.income)}`).join("; "),
          })}
        />
      </ClearCard>

      <MoversCard
        data={data}
        t={t}
        subtitle={t("movers.subtitle", { after: span(basisMonths), before: beforeSpan })}
        compare={{
          subtitle: data.comparison.cmpA === running
            ? t("movers.compareSubtitleSoFar", { a: name(data.comparison.cmpA), b: name(data.comparison.cmpB) })
            : t("movers.compareSubtitle", { a: name(data.comparison.cmpA), b: name(data.comparison.cmpB) }),
          shortA: short(data.comparison.cmpA),
          shortB: short(data.comparison.cmpB),
          months: data.comparison.pickable.map((m) => ({ value: m, label: long(m) })),
          footnote: comparisonFootnote(data, t, locale, name, dayMonth, financialMonth),
        }}
        className="lg:col-span-2 xl:col-span-1"
      />

      <ExpensesTable
        rows={data.categories.map((c): ExpenseRow => ({
          id: c.id,
          name: c.name,
          color: c.color,
          icon: c.icon,
          group: c.group,
          values: c.trend.values,
          total: c.trend.total,
          avg: c.trend.avg,
          current: c.trend.current,
          vsBefore: data.movers ? c.trend.vsBefore : null,
          spike: c.trend.spike,
          meta: c.merchants.length > 0
            ? t("table.metaMerchants", { pct: c.share, merchants: c.merchants.join(", ") })
            : t("table.metaShare", { pct: c.share, group: c.group === "needs" ? t("table.groupNeeds") : t("table.groupWants") }),
          due: c.dueDate ? t("table.due", { date: dayMonth(c.dueDate) }) : null,
        }))}
        subtitle={t("table.subtitle", { count: data.categories.length })}
        monthsLabel={span(months)}
        currentLabel={currentLabel}
        beforeLabel={data.movers ? t("table.vsBefore", { months: beforeSpan }) : null}
        footer={{
          left: data.uncategorised >= 1 ? t("table.uncategorised", { amount: formatEurWhole(data.uncategorised) }) : null,
          avg: summary.avgExpense,
          total: data.totalExpense,
        }}
        financialMonth={financialMonth}
        periodRange={{ from: financialMonthRangeByMonth(months[0], financialMonth).from, to: financialMonthRangeByMonth(months.at(-1)!, financialMonth).to }}
        className="lg:col-span-2 xl:col-span-3"
      />

      <AnchoredTip id="insightsMovers" anchor="insightsMovers" />
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"insights.trendsTab">>>;

/** The URL's period as the months it covers (untrimmed: the heading names what was picked). */
function headingMonths(sp: { range?: string; from?: string; to?: string }, financialMonth: FinancialMonthConfig) {
  const range = parseTrendsRange(sp);
  const current = currentFinancialMonth(financialMonth);
  return { range, current, months: trendsMonths(range, current, financialMonth) };
}

/**
 * The Trends line under the Insights title: the months in the period ("May – October
 * 2026") and, while the last one runs, until when ("October runs until 31 Oct").
 */
export async function getTrendsHeading(sp: { range?: string; from?: string; to?: string }, financialMonth: FinancialMonthConfig) {
  const locale = await getLocale();
  const { months, current } = headingMonths(sp, financialMonth);
  const endOf = (ym: string) => new Date(`${financialMonthRangeByMonth(ym, financialMonth).to}T12:00:00`);
  const first = endOf(months[0]);
  const last = endOf(months.at(-1)!);
  const monthYear = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  const period =
    months.length === 1
      ? monthYear.format(last)
      : `${new Intl.DateTimeFormat(locale, first.getFullYear() === last.getFullYear() ? { month: "long" } : { month: "long", year: "numeric" }).format(first)} – ${monthYear.format(last)}`;
  if (months.at(-1) !== current) return { period, running: null };
  const name = new Intl.DateTimeFormat(locale, { month: "long" }).format(last);
  return {
    period,
    running: {
      month: name.charAt(0).toLocaleUpperCase(locale) + name.slice(1),
      date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(last),
    },
  };
}

/** Trends' period control for the Insights tab row: 3 · 6 · 12 months and Custom. */
export async function TrendsPeriodSlot({ sp, financialMonth }: { sp: { range?: string; from?: string; to?: string }; financialMonth: FinancialMonthConfig }) {
  const locale = await getLocale();
  const { range, current } = headingMonths(sp, financialMonth);
  const long = (ym: string) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(`${financialMonthRangeByMonth(ym, financialMonth).to}T12:00:00`));
  return (
    <TrendsPeriodControl
      active={range.kind === "custom" ? "custom" : String(range.count)}
      months={customMonths(current, financialMonth, long)}
      customFrom={range.kind === "custom" ? financialMonthForDate(range.from, financialMonth) : undefined}
      customTo={range.kind === "custom" ? financialMonthForDate(range.to, financialMonth) : undefined}
    />
  );
}

/** The budget months Custom offers: the last three years up to the current one. */
function customMonths(current: string, financialMonth: FinancialMonthConfig, long: (ym: string) => string): CustomMonth[] {
  return Array.from({ length: CUSTOM_MONTHS }, (_, i) => offsetFinancialMonth(current, i - CUSTOM_MONTHS + 1)).map((m) => {
    const r = financialMonthRangeByMonth(m, financialMonth);
    return { value: m, label: long(m), from: r.from, to: r.to };
  });
}

/** All spending (needs + wants), Needs, Wants, then every category, largest first. */
function chartFocuses(data: TrendsData, t: T): SpendingFocus[] {
  return [
    { key: "all", label: t("chart.all"), needs: data.flows.map((f) => f.needs), wants: data.flows.map((f) => f.wants) },
    { key: "needs", label: t("chart.needs"), values: data.flows.map((f) => f.needs) },
    { key: "wants", label: t("chart.wants"), values: data.flows.map((f) => f.wants) },
    ...data.categories.map((c) => ({ key: `cat-${c.id}`, label: c.name, values: c.trend.values })),
  ];
}

/** Kept per month: the answer, with the finished months as small bars. */
function KeptHero({ data, t, short }: { data: TrendsData; t: T; short: (ym: string) => string }) {
  const { summary } = data;
  const kept = summary.basis.map((f) => ({ month: f.month, value: f.income - f.expense }));
  const max = Math.max(1, ...kept.map((k) => Math.abs(k.value)));
  const W = 96;
  const H = 36;
  const n = kept.length;
  const gap = n > 8 ? 2 : 5;
  const bw = n > 0 ? (W - gap * (n - 1)) / n : 0;
  const baseline = H - 12;

  return (
    <ClearCard hero aria-labelledby="trends-kept-title" className="gap-0 px-5 py-[18px]">
      <span id="trends-kept-title" className="text-[13px] font-semibold text-clear-hero-ink-2">{t("kept")}</span>
      <div className="mt-1 flex items-end justify-between gap-2.5">
        <span className="flex items-baseline gap-0.5">
          <Amount value={summary.kept} whole sign="always" className="text-[30px] leading-[1.05] font-bold! tracking-[-0.02em]" />
          <span className="text-[15px] font-semibold text-clear-hero-ink-2">{t("perMonth")}</span>
        </span>
        {n > 0 && (
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={t("keptDescription", { months: kept.map((k) => `${short(k.month)} ${signed(k.value)}`).join(", ") })}
            className="shrink-0"
          >
            <line x1="0" x2={W} y1={baseline} y2={baseline} stroke="var(--clr-hero-ink)" strokeOpacity={0.25} />
            {kept.map((k, i) => {
              const h = Math.max(2, (Math.abs(k.value) / max) * (k.value >= 0 ? baseline - 2 : H - baseline - 1));
              return (
                <rect
                  key={k.month}
                  x={i * (bw + gap)}
                  y={k.value >= 0 ? baseline - h : baseline}
                  width={bw}
                  height={h}
                  rx={Math.min(3, bw / 3)}
                  fill={k.value >= 0 ? "var(--clr-hero-ink)" : "var(--clr-ember)"}
                />
              );
            })}
          </svg>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-clear-hero-ink-2">
        {summary.finished > 0 ? (
          <>
            <ClearChip className="h-6 bg-clear-hero-ink/15 px-2.5 text-xs font-semibold text-clear-hero-ink">{t("positive", { count: summary.positive, total: summary.finished })}</ClearChip>
            {t("finishedOnly")}
          </>
        ) : (
          t("noFinished")
        )}
      </div>
    </ClearCard>
  );
}

/** Needs, wants and savings as shares of income, against the plan's split. */
function SplitCard({ data, t, className }: { data: TrendsData; t: T; className?: string }) {
  const { split, strategy } = data;
  return (
    <ClearCard aria-labelledby="trends-split-title" className={cn("gap-0 px-5 py-[18px]", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span id="trends-split-title" className="text-[13px] font-semibold text-clear-ink-2">{t("split")}</span>
        <span className="text-xs text-clear-muted">{t("splitPlan", { needs: strategy.nodig, wants: strategy.willen, savings: strategy.sparen })}</span>
      </div>
      {split ? (
        <>
          <div
            role="img"
            aria-label={t("splitDescription", { needs: split.needs, wants: split.wants, savings: split.savings })}
            className="mt-2.5 flex h-2.5 gap-[3px]"
          >
            {split.needs > 0 && <span className="rounded-full bg-clear-ink" style={{ width: `${Math.min(100, split.needs)}%` }} />}
            {split.wants > 0 && <span className="rounded-full bg-clear-placeholder" style={{ width: `${Math.min(100, split.wants)}%` }} />}
            {split.savings > 0 && <span className="rounded-full bg-clear-positive-fill" style={{ width: `${Math.min(100, split.savings)}%` }} />}
            <span className="min-w-0 flex-1 rounded-full bg-clear-stone" />
          </div>
          <div className="mt-2 flex justify-between gap-2 text-xs font-semibold">
            <span>{t("chart.needs")} <span className={split.needsOk ? "text-clear-positive" : "text-clear-warning"}>{split.needs}%</span></span>
            <span>{t("chart.wants")} <span className={split.wantsOk ? "text-clear-positive" : "text-clear-warning"}>{split.wants}%</span></span>
            <span>{t("savings")} <span className={split.savingsOk ? "text-clear-positive" : "text-clear-warning"}>{split.savings}%</span></span>
          </div>
        </>
      ) : (
        <p className="m-0 mt-2.5 text-sm text-clear-muted">{t("splitNone")}</p>
      )}
    </ClearCard>
  );
}

/** What changed per month against the months before, both ways, with the numbers. */
function MoversCard({
  data,
  t,
  subtitle,
  compare,
  className,
}: {
  data: TrendsData;
  t: T;
  subtitle: string;
  compare: { subtitle: string; shortA: string; shortB: string; months: { value: string; label: string }[]; footnote: string | null };
  className?: string;
}) {
  const { movers } = data;
  const row = (m: NonNullable<TrendsData["movers"]>["up"][number], up: boolean) => (
    <li key={m.id} className="flex items-center gap-2.5 py-[7px]">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{m.name}</span>
        <span className="truncate text-xs text-clear-muted">
          <MoneyText>
            {m.reason
              ? t("movers.fromToReason", { from: formatEurWhole(m.before), to: formatEurWhole(m.after), reason: t("movers.mostly", { merchant: m.reason }) })
              : t("movers.fromTo", { from: formatEurWhole(m.before), to: formatEurWhole(m.after) })}
          </MoneyText>
        </span>
      </span>
      <ClearChip tone={up ? "peach" : "mint"} className="h-6 px-2.5 text-xs font-semibold">{signed(m.delta)}</ClearChip>
    </li>
  );

  return (
    <ClearCard aria-labelledby="trends-movers-title" data-tip-anchor="insightsMovers" className={cn("gap-0", className)}>
      <ClearCardHeader title={<span id="trends-movers-title">{t("movers.title")}</span>} subtitle={subtitle} />
      {!movers ? (
        <p className="m-0 mt-3 text-sm text-clear-muted">{t("movers.noHistory")}</p>
      ) : movers.up.length === 0 && movers.down.length === 0 ? (
        <p className="m-0 mt-3 text-sm text-clear-muted"><MoneyText>{t("movers.none", { amount: formatEurWhole(5) })}</MoneyText></p>
      ) : (
        <>
          {movers.up.length > 0 && (
            <>
              <h3 className="m-0 pt-2.5 pb-1 text-xs font-semibold text-clear-muted">{t("movers.up")}</h3>
              <ul className="m-0 list-none p-0">{movers.up.map((m) => row(m, true))}</ul>
            </>
          )}
          {movers.down.length > 0 && (
            <>
              <h3 className="m-0 pt-2 pb-1 text-xs font-semibold text-clear-muted">{t("movers.down")}</h3>
              <ul className="m-0 list-none p-0">{movers.down.map((m) => row(m, false))}</ul>
            </>
          )}
        </>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 pt-2.5">
        <CompareMonthsDialog
          cmpA={data.comparison.cmpA}
          cmpB={data.comparison.cmpB}
          subtitle={compare.subtitle}
          shortA={compare.shortA}
          shortB={compare.shortB}
          statsA={data.comparison.statsA}
          statsB={data.comparison.statsB}
          months={compare.months}
          footnote={compare.footnote}
        />
        {movers && (movers.up.length > 0 || movers.down.length > 0) && (
          <span className="text-xs text-clear-muted"><MoneyText>{t("movers.net", { amount: signed(movers.net) })}</MoneyText></span>
        )}
      </div>
    </ClearCard>
  );
}

/** Under the comparison, while one of its months still runs: until when, and the bills still to come. */
function comparisonFootnote(
  data: TrendsData,
  t: T,
  locale: string,
  name: (ym: string) => string,
  dayMonth: (date: string) => string,
  financialMonth: FinancialMonthConfig,
): string | null {
  const { running } = data;
  const due = data.comparison.runningBills;
  if (!running || !due) return null;
  const n = name(running);
  const month = n.charAt(0).toLocaleUpperCase(locale) + n.slice(1);
  const date = dayMonth(financialMonthRangeByMonth(running, financialMonth).to);
  if (due.length === 0) return t("movers.runsUntil", { month, date });
  const names = due.slice(0, MAX_BILL_NAMES).map((b) => b.name);
  const list = due.length > MAX_BILL_NAMES
    ? t("movers.billsMore", { list: names.join(", "), count: due.length - MAX_BILL_NAMES })
    : new Intl.ListFormat(locale, { type: "conjunction" }).format(names);
  return t("movers.stillDue", { month, date, list, amount: formatEurWhole(due.reduce((s, b) => s + b.amount, 0)) });
}

/** No transactions yet: the shell, a shape, one sentence, the import action and placeholders. */
async function TrendsEmpty() {
  const t = await getTranslations("insights.trendsTab.empty");
  return (
    <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      <ClearCard aria-labelledby="trends-empty-title" className="items-center justify-center gap-6 px-8 py-12 text-center lg:col-span-2">
        <svg width="220" height="150" viewBox="0 0 220 150" fill="none" aria-hidden className="h-auto max-w-full">
          <circle cx="110" cy="80" r="66" fill="var(--clr-sky)" />
          <path d="M36 130h148" stroke="var(--clr-ink)" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="56" y="88" width="22" height="42" rx="6" fill="var(--clr-ink)" />
          <rect x="88" y="70" width="22" height="60" rx="6" fill="var(--clr-placeholder)" />
          <rect x="120" y="58" width="22" height="72" rx="6" fill="var(--clr-card)" stroke="var(--clr-placeholder)" strokeWidth="2.2" strokeDasharray="5 4" />
          <path d="M60 60L100 44L140 36L176 22" stroke="var(--clr-positive-fill)" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="176" cy="22" r="6" fill="var(--clr-ember)" />
        </svg>
        <div className="flex flex-col items-center gap-2.5">
          <h2 id="trends-empty-title" className="m-0 text-2xl font-bold tracking-[-0.02em]">{t("title")}</h2>
          <p className="m-0 max-w-[460px] text-base leading-normal text-clear-ink-2">{t("body")}</p>
        </div>
        <Link href="/settings?panel=import" className={clearButtonVariants({ size: "lg" })}>
          <IconFileImport aria-hidden />
          {t("action")}
        </Link>
      </ClearCard>
      <div className="flex flex-col gap-5 lg:col-span-2 xl:col-span-1">
        <Placeholder title={t("chart")} body={t("chartBody")} Glyph={IconChartBar} />
        <Placeholder title={t("movers")} body={t("moversBody")} Glyph={IconTrendingUp} />
      </div>
    </div>
  );
}

function Placeholder({ title, body, Glyph }: { title: string; body: string; Glyph: typeof IconChartBar }) {
  return (
    <div className="flex min-h-[180px] flex-1 flex-col items-center justify-center gap-1 rounded-clear-card border-2 border-dashed border-clear-line p-6 text-center font-clear">
      <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-clear-ink-2">
        <Glyph size={18} stroke={1.9} aria-hidden />
        {title}
      </span>
      <span className="text-[13px] text-clear-muted">{body}</span>
    </div>
  );
}

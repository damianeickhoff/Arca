import { getLocale, getTranslations } from "next-intl/server";
import { IconArrowUpRight, IconArrowDownRight, IconBulb } from "@tabler/icons-react";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { getFinancialHealth } from "@/lib/financial-health-data";
import { getHealthHistory } from "@/lib/health-snapshots";
import { healthState } from "@/lib/financial-health";
import { getCurrentVsPreviousMonth } from "@/lib/month-comparison";
import { getNetWorthHistory } from "@/lib/net-worth-snapshots";
import { formatEur, formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SPLIT_GRID } from "@/components/page-container";
import { SectionHead } from "@/components/ui/page-heading";
import { Pill } from "@/components/ui/pill";
import { Bar, Ring } from "@/components/ui/ring";
import { InkLineChart } from "@/components/ui/ink-line-chart";
import { StackedBars, LegendRow } from "@/components/ui/charts";
import { AnchoredTip } from "@/components/anchored-tip";
import { CARD } from "./insights-ui";
import { getNetWorthData } from "./report-tabs";

// ─── Insights → Health ───────────────────────────────────────────────────────
//
// A high-level read on where the user's finances stand: one score, why it is what
// it is, and what would move it most. Deliberately not a budgeting, forecasting or
// analytics view — there's no period picker and no per-transaction detail; the
// other Insights tabs own that. All scoring lives in lib/financial-health.ts and
// lib/financial-health-data.ts; this file only renders.

/** The V5 bar colours for a 0–1 ratio: green from 80%, mustard from 65%, else warning. */
function areaColor(ratio: number) {
  return ratio >= 0.8 ? "var(--arca-positive)" : ratio >= 0.65 ? "var(--arca-accent)" : "var(--arca-warning)";
}

export async function HealthTab() {
  const financialMonth = await getFinancialMonthConfig();
  const [health, history, comparison, netWorthData, netWorthHistory, t, locale] = await Promise.all([
    getFinancialHealth(financialMonth),
    getHealthHistory(12),
    getCurrentVsPreviousMonth(financialMonth),
    getNetWorthData(),
    getNetWorthHistory(90),
    getTranslations("insights.health"),
    getLocale(),
  ]);
  const dateLocale = locale === "nl" ? "nl-NL" : "en-GB";
  const monthName = (ym: string, opts: Intl.DateTimeFormatOptions = { month: "long" }) =>
    new Date(`${ym}-15T12:00:00`).toLocaleDateString(dateLocale, opts);

  // Nothing measurable at all — every category came back as "not enough data".
  if (health.score === null || health.state === null) {
    return (
      <section className={cn(CARD, "flex flex-col items-center gap-2 px-6 py-12 text-center")}>
        <h2 className="heading text-lg text-ink">{t("title")}</h2>
        <p className="max-w-xs text-[13px] leading-relaxed text-ink-2">{health.summary}</p>
      </section>
    );
  }

  // The score's movement since the previous recorded month, for the headline.
  const scored = history.filter((h) => h.score != null);
  const prev = scored.length >= 2 ? scored[scored.length - 2] : null;
  const delta = prev ? Math.round(health.score - prev.score) : null;
  const headline =
    delta == null || prev == null
      ? health.state.label
      : delta > 0
        ? t("up", { count: delta, month: monthName(prev.month) })
        : delta < 0
          ? t("down", { count: -delta, month: monthName(prev.month) })
          : t("same", { month: monthName(prev.month) });
  const recent = scored.slice(-6);

  const top = health.opportunities[0] ?? null;
  const moreOpportunities = health.opportunities.slice(1);

  // Net worth — the same figure as the Net worth tab, split the way the V5 card does.
  const { goals, accounts, netWorthBanks, debtSummary, totalDebt, netWorth } = netWorthData;
  const sumType = (type: string) => accounts.filter((a) => a.type === type).reduce((s, a) => s + a.value, 0);
  const nwRows = [
    { key: "checking", name: t("checking"), value: netWorthBanks.reduce((s, b) => s + b.balance, 0) + sumType("betaalrekening"), color: "var(--arca-accent)" },
    { key: "savings", name: t("savings"), value: goals.reduce((s, g) => s + g.currentAmount, 0) + sumType("spaarrekening"), color: "#1F8F8A" },
    { key: "investments", name: t("investments"), value: sumType("beleggingen"), color: "#6B5BD2" },
    { key: "possessions", name: t("possessions"), value: sumType("bezitting"), color: "#6E7A86" },
    { key: "owed", name: t("owed"), value: debtSummary?.totalOwed ?? 0, color: "#A9A294" },
  ].filter((r) => r.value !== 0);
  const nwStart = netWorthHistory[0]?.netWorth ?? null;
  const nwDelta = nwStart != null && netWorthHistory.length >= 2 ? netWorth - nwStart : null;

  const c = comparison;
  const kpis = [
    { key: "income", label: t("income"), value: formatEur(c.current.income), diff: c.current.income - c.previous.income, goodUp: true, money: true },
    { key: "expenses", label: t("expenses"), value: formatEur(c.current.expense), diff: c.current.expense - c.previous.expense, goodUp: false, money: true },
    {
      key: "rate",
      label: t("savingsRate"),
      value: c.current.savingsRate == null ? "—" : `${Math.round(c.current.savingsRate * 100)}%`,
      diff: c.current.savingsRate != null && c.previous.savingsRate != null ? Math.round((c.current.savingsRate - c.previous.savingsRate) * 100) : null,
      goodUp: true,
      money: false,
    },
    ...(c.biggest
      ? [{ key: "biggest", label: c.biggest.name, value: formatEur(c.biggest.now), diff: c.biggest.now - c.biggest.prev, goodUp: false, money: true }]
      : []),
  ];

  return (
    <div className={SPLIT_GRID}>
      <div className="flex min-w-0 flex-col gap-5">
        {/* 1. The score, where it has gone since last month, and why. */}
        <section className={cn(CARD, "flex flex-col gap-5 p-[18px] sm:flex-row sm:items-center sm:gap-7 lg:px-6 lg:py-[22px]")}>
          <Ring pct={health.score} color={health.state.color} size={140} stroke={12} className="self-center">
            <span className="amount text-[46px] leading-none text-ink">{health.score}</span>
            <span className="mono-label mt-1 text-[10px]" style={{ color: health.state.color }}>{health.state.label}</span>
          </Ring>
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <h2 className="heading text-lg leading-tight text-ink lg:text-2xl">{headline}</h2>
            <p className="max-w-[52ch] text-[13px] leading-[1.55] text-ink-2">{health.summary}</p>
            {recent.length >= 2 && (
              <div className="flex items-end gap-2.5">
                <StackedBars
                  columns={recent.map((h) => [h.score])}
                  colors={["var(--arca-surface-2)"]}
                  height={44}
                  gap={6}
                  className="w-[240px] max-w-full [&>div:last-child>span]:!bg-mustard"
                  titles={recent.map((h) => `${monthName(h.month, { month: "short", year: "2-digit" })} · ${Math.round(h.score)}`)}
                />
                <span className="mono-label text-[10px]">
                  {monthName(recent[0].month, { month: "short" })} – {monthName(recent[recent.length - 1].month, { month: "short" })}
                </span>
              </div>
            )}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          {/* 2. The areas the score is made of — each with its bar, points and the
                 explanation. Unmeasurable areas stay listed, greyed. */}
          <section className={cn(CARD, "flex flex-col gap-1.5 px-[18px] py-4 lg:px-5")}>
            <SectionHead title={t("areas", { count: health.categories.length })} size="sm" />
            {health.categories.map((cat) => (
              <div key={cat.key} className="flex flex-col gap-1.5 border-t border-line py-2.5 first-of-type:border-t-0">
                <div className="flex items-center gap-3">
                  <span className={cn("w-[130px] shrink-0 truncate text-[13px] font-semibold", cat.ratio == null ? "text-ink-3" : "text-ink")}>{cat.label}</span>
                  <span className="min-w-0 flex-1">
                    {cat.ratio != null ? <Bar pct={cat.ratio * 100} color={areaColor(cat.ratio)} height={6} /> : <Bar pct={0} color="transparent" height={6} />}
                  </span>
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums text-ink-3">
                    {cat.points === null ? t("na") : `${cat.points}/${cat.maxPoints}`}
                  </span>
                </div>
                <p className="text-xs leading-[1.5] text-ink-3">{cat.points === null ? t("notEnough") : cat.detail}</p>
              </div>
            ))}
          </section>

          {/* 3. This month against last month. */}
          <section data-tip-anchor="insightsHealthCompare" className={cn(CARD, "flex flex-col gap-3 px-[18px] py-4 lg:px-5")}>
            <SectionHead
              title={t("vsMonth", { now: monthName(c.current.month), prev: monthName(c.previous.month) })}
              size="sm"
              link={t("trends")}
              href="/reports?tab=trends"
            />
            <div className="grid grid-cols-2 gap-2.5">
              {kpis.map((k) => {
                const good = k.diff == null || k.diff === 0 ? null : k.goodUp ? k.diff > 0 : k.diff < 0;
                return (
                  <div key={k.key} className="flex min-w-0 flex-col gap-1 rounded-tile bg-surface-2 px-4 py-3.5">
                    <span className="mono-label truncate text-[10px]">{k.label}</span>
                    <span className="amount truncate text-[22px] leading-tight text-ink">{k.value}</span>
                    {k.diff != null && (
                      <span className={cn("inline-flex items-center gap-1 text-xs font-bold", good == null ? "text-ink-3" : good ? "text-positive" : "text-negative")}>
                        {k.diff > 0 ? <IconArrowUpRight className="size-3.5" /> : k.diff < 0 ? <IconArrowDownRight className="size-3.5" /> : null}
                        {k.money ? `${k.diff > 0 ? "+" : k.diff < 0 ? "-" : ""}${formatEurWhole(Math.abs(k.diff))}` : t("points", { count: k.diff })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {c.biggest && (
              <p className="text-xs leading-[1.5] text-ink-3">
                {t("biggestChange", {
                  name: c.biggest.name,
                  direction: c.biggest.now > c.biggest.prev ? "up" : "down",
                  amount: formatEurWhole(Math.abs(c.biggest.now - c.biggest.prev)),
                  month: monthName(c.previous.month),
                })}
              </p>
            )}
          </section>
        </div>

        {/* Monthly history — the recorded snapshots, newest first. */}
        {history.length > 0 && (
          <section className={cn(CARD, "flex flex-col gap-2 px-[18px] py-4 lg:px-5")}>
            <SectionHead title={t("history")} size="sm" />
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-2 text-xs">
              <span className="mono-label text-[10px]">{t("month")}</span>
              <span className="mono-label text-right text-[10px]">{t("score")}</span>
              <span className="mono-label text-right text-[10px]">{t("netWorth")}</span>
              <span className="mono-label text-right text-[10px]">{t("savingsRate")}</span>
              {[...history].reverse().map((row) => (
                <div key={row.month} className="contents">
                  <span className="text-ink-2">{monthName(row.month, { month: "short", year: "2-digit" })}</span>
                  <span className="text-right font-semibold tabular-nums" style={{ color: healthState(row.score).color }}>
                    {Math.round(row.score)}
                  </span>
                  <span className="text-right tabular-nums text-ink-2">{row.netWorth == null ? "—" : formatEur(row.netWorth)}</span>
                  <span className="text-right tabular-nums text-ink-2">{row.savingsRate == null ? "—" : `${Math.round(row.savingsRate * 100)}%`}</span>
                </div>
              ))}
            </div>
            {scored.length < 2 && <p className="pt-1 text-xs text-ink-3">{t("trendLater")}</p>}
          </section>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        {/* Net worth, as on the Net worth tab. */}
        <section className={cn(CARD, "flex flex-col gap-3 px-[18px] py-4 lg:px-5")}>
          <SectionHead title={t("netWorth")} size="sm" link={t("details")} href="/reports?tab=vermogen" />
          <div className="flex flex-wrap items-end justify-between gap-2">
            <span className={cn("amount text-[34px] leading-none", netWorth < 0 ? "text-negative" : "text-ink")}>{formatEurWhole(netWorth)}</span>
            {nwDelta != null && (
              <Pill tone={nwDelta >= 0 ? "positive" : "negative"} icon={nwDelta >= 0 ? <IconArrowUpRight /> : <IconArrowDownRight />}>
                {t("inDays", { amount: `${nwDelta >= 0 ? "+" : "-"}${formatEurWhole(Math.abs(nwDelta))}`, count: netWorthHistory.length })}
              </Pill>
            )}
          </div>
          {netWorthHistory.length >= 2 && <InkLineChart values={netWorthHistory.map((h) => h.netWorth)} height={80} width={330} gradientId="health-networth" />}
          <div className="flex flex-col">
            {nwRows.map((r) => (
              <LegendRow key={r.key} color={r.color} label={r.name} value={formatEurWhole(r.value)} />
            ))}
            {totalDebt > 0 && <LegendRow color="var(--arca-negative)" label={t("debts")} value={formatEurWhole(-totalDebt)} />}
          </div>
        </section>

        <AnchoredTip id="insightsHealthCompare" anchor="insightsHealthCompare" />

        {/* 4. What would move the score most. */}
        {top && (
          <section className={cn(CARD, "flex flex-col gap-3 p-4")}>
            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-mustard-soft text-mustard-strong">
                <IconBulb className="size-5" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="mono-label text-[10px] text-mustard-strong">{t("nextStep")}</span>
                <span className="text-sm font-bold text-ink">{top.action}</span>
                <span className="text-xs text-ink-2">{t("potential", { label: top.label, count: top.potential })}</span>
              </div>
            </div>
            {moreOpportunities.length > 0 && (
              <div className="flex flex-col border-t border-line pt-2">
                {moreOpportunities.map((op) => (
                  <div key={op.key} className="flex min-h-10 items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-[13px] text-ink">{op.action}</span>
                    <Pill tone="positive" icon={<IconArrowUpRight />}>{t("pts", { count: op.potential })}</Pill>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

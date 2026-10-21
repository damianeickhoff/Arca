"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatEurWhole } from "@/lib/format";
import type { PayoffSimulation } from "@/lib/debt-simulate";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { MoneyText, SvgMoneyText } from "@/components/clear/money";
import { Segmented } from "@/components/clear/segmented";
import type { ComputedDebt } from "./debt-shared";
import { debtTones, monthsFromNow, useMonthYear } from "./debt-ui";

type Mode = "balance" | "interest";

/** A series' value at month `i`; past its end it stays at its last value. */
const at = (series: readonly number[], i: number) => series[Math.min(i, series.length - 1)] ?? 0;

/** Running totals: what has been paid in interest by each month. */
function cumulative(series: readonly number[]) {
  let sum = 0;
  return series.map((v) => (sum = Math.round((sum + v) * 100) / 100));
}

const HEIGHT = 220;
const PAD = { top: 12, bottom: 10 };

/**
 * Plan · Debts' "Payoff timeline", a full-width row under everything else: each debt as
 * its own stacked area in its pastel (the first in the payoff order on top), the
 * minimums-only total as a dashed line, the debt-free month as an orange dot. A fixed
 * 220px chart, so the card never stretches. Hover, tap or the arrow keys read out a
 * month: what is paid off by then, each debt's balance and the total against the
 * minimums. "Interest paid" stacks the interest each debt has cost so far instead.
 */
export function PayoffTimelineCard({
  active,
  base,
  sim,
  extra,
  className,
}: {
  /** The open debts, in the payoff order. */
  active: ComputedDebt[];
  /** The minimums only. */
  base: PayoffSimulation;
  /** With the extra. */
  sim: PayoffSimulation;
  extra: number;
  className?: string;
}) {
  const t = useTranslations("plan.debts.timeline");
  const locale = useLocale();
  const monthYear = useMonthYear();
  const list = useMemo(() => new Intl.ListFormat(locale, { type: "conjunction" }), [locale]);
  const [mode, setMode] = useState<Mode>("balance");
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const tones = useMemo(() => debtTones(active.map((c) => c.debt.id)), [active]);
  const showBase = extra > 0;
  // Long enough to show everything ending (the minimums too, when they are shown),
  // capped at 30 years so a debt that never ends doesn't flatten the rest.
  const span = Math.max(1, Math.min(360, (showBase ? Math.max(sim.totals.length, base.totals.length) : sim.totals.length) - 1));

  // Each debt's series in the chosen mode, in the payoff order.
  const debts = active.flatMap((c) => {
    const s = sim.byDebt.find((d) => d.id === c.debt.id);
    if (!s) return [];
    const series = mode === "balance" ? s.balances : cumulative(s.interestByMonth);
    return [{ c, s, series, tone: tones.get(c.debt.id) ?? "peach" }];
  });
  const baseSeries = mode === "balance" ? base.totals : cumulative(base.byDebt.reduce<number[]>((sum, d) => d.interestByMonth.map((v, i) => (sum[i] ?? 0) + v), []));
  const simTotal = (i: number) => debts.reduce((sum, d) => sum + at(d.series, i), 0);

  const top = Math.max(1, ...Array.from({ length: span + 1 }, (_, i) => Math.max(simTotal(i), showBase ? at(baseSeries, i) : 0)));
  const W = width;
  const x = (i: number) => (i / span) * W;
  const y = (v: number) => PAD.top + (1 - v / top) * (HEIGHT - PAD.top - PAD.bottom);
  const floor = y(0);

  // Stacked bottom-up from the last debt in the order, so the one the extra goes to
  // first sits on top. A balance band ends in the month its debt is paid off.
  const bands: { id: number; tone: string; d: string }[] = [];
  let lower = Array.from({ length: span + 1 }, () => 0);
  for (const d of [...debts].reverse()) {
    const end = mode === "balance" ? Math.min(span, d.s.months ?? span) : span;
    const upper = lower.map((v, i) => v + at(d.series, i));
    const topEdge = upper.slice(0, end + 1).map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const bottomEdge = lower
      .slice(0, end + 1)
      .map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .reverse();
    bands.push({ id: d.c.debt.id, tone: d.tone, d: `${topEdge.join(" ")} ${bottomEdge.join(" ")} Z` });
    lower = upper;
  }
  const baseLine = Array.from({ length: Math.min(span, base.totals.length - 1) + 1 }, (_, i) => `${x(i).toFixed(1)},${y(at(baseSeries, i)).toFixed(1)}`).join(" ");

  const date = (m: number) => (m === 0 ? t("now") : monthYear(monthsFromNow(m)));
  // The readout opens on the first payoff, so there is something to read straight away.
  const firstPayoff = Math.min(span, ...debts.map((d) => d.s.months ?? span).filter((m) => m > 0));
  const month = hover ?? firstPayoff;

  const readout = (() => {
    const finished = debts.filter((d) => month > 0 && d.s.months === month);
    const total = Math.round(simTotal(month));
    const baseTotal = Math.round(at(baseSeries, month));
    const headline =
      finished.length > 0
        ? t("paidOff", { names: list.format(finished.map((d) => d.c.debt.name)) })
        : mode === "balance"
          ? total <= 0
            ? t("debtFree")
            : t("leftTotal", { amount: formatEurWhole(total) })
          : t("interestSoFar", { amount: formatEurWhole(total) });
    const detail = debts
      .filter((d) => !finished.includes(d))
      .map((d) =>
        mode === "balance" && d.s.months != null && d.s.months <= month
          ? t("debtDone", { name: d.c.debt.name })
          : t("debtLine", { name: d.c.debt.name, amount: formatEurWhole(at(d.series, month)) }),
      )
      .join(" · ");
    const totals = showBase
      ? t("totalVs", { amount: formatEurWhole(total), base: formatEurWhole(baseTotal) })
      : t("total", { amount: formatEurWhole(total) });
    return { date: date(month), headline, detail, totals };
  })();

  function pick(e: React.PointerEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0) return;
    setHover(Math.max(0, Math.min(span, Math.round(((e.clientX - r.left) / r.width) * span))));
  }

  function step(e: React.KeyboardEvent<HTMLElement>) {
    const next =
      e.key === "ArrowLeft" ? month - 1
      : e.key === "ArrowRight" ? month + 1
      : e.key === "PageDown" ? month - 12
      : e.key === "PageUp" ? month + 12
      : e.key === "Home" ? 0
      : e.key === "End" ? span
      : e.key === "Escape" ? null
      : undefined;
    if (next === undefined) return;
    e.preventDefault();
    setHover(next == null ? null : Math.max(0, Math.min(span, next)));
  }

  // Axis labels: now, the debt-free month with the extra and at the minimums — each
  // only where it doesn't run into one already placed.
  const marks: number[] = [];
  for (const m of [0, sim.months, showBase ? base.months : null]) {
    if (m == null || m > span) continue;
    if (marks.every((p) => Math.abs(p - m) / span >= 0.12)) marks.push(m);
  }
  marks.sort((a, z) => a - z);

  const end = sim.months != null ? t("debtFreeOn", { date: monthYear(monthsFromNow(sim.months)) }) : t("debtFreeNever");
  const summary = [
    mode === "balance"
      ? t("summary", { amount: formatEurWhole(sim.totals[0] ?? 0), end })
      : t("summaryInterest", { amount: formatEurWhole(sim.interest), end }),
    ...debts.map((d) =>
      d.s.months != null ? t("summaryDebt", { name: d.c.debt.name, date: monthYear(monthsFromNow(d.s.months)) }) : t("summaryDebtNever", { name: d.c.debt.name }),
    ),
  ].join(". ");

  const dotAt = mode === "balance" && sim.months != null && sim.months <= span ? x(sim.months) : null;
  const labelLeft = dotAt != null && dotAt > W - 150;
  const flipped = month / span > 0.6;

  return (
    <ClearCard aria-labelledby="debts-timeline-title" className={cn("gap-3.5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ClearCardHeader
          title={<span id="debts-timeline-title">{t("title")}</span>}
          subtitle={<MoneyText>{showBase ? t("subtitleExtra", { amount: formatEurWhole(extra) }) : t("subtitleMinimums")}</MoneyText>}
          className="min-w-0 flex-1"
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ul aria-hidden className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0 text-xs font-medium text-clear-ink-2">
            {debts.map((d) => (
              <li key={d.c.debt.id} className="inline-flex items-center gap-1.5">
                <span
                  className="size-2.5 shrink-0 rounded-[3px] border"
                  style={{ background: `var(--clr-${d.tone})`, borderColor: `var(--clr-${d.tone}-ink)` }}
                />
                {d.c.debt.name}
              </li>
            ))}
            {showBase && (
              <li className="inline-flex items-center gap-1.5">
                <span className="h-0 w-3.5 shrink-0 border-t-2 border-dashed border-clear-muted" />
                {t("minimumsOnly")}
              </li>
            )}
          </ul>
          <Segmented<Mode>
            label={t("modeLabel")}
            surface="tile"
            size="sm"
            value={mode}
            onChange={setMode}
            items={[
              { value: "balance", label: t("balance") },
              { value: "interest", label: t("interest") },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          ref={boxRef}
          role="group"
          tabIndex={0}
          aria-label={`${summary}. ${t("keys")}`}
          onPointerDown={pick}
          onPointerMove={pick}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setHover(null);
          }}
          onKeyDown={step}
          className="relative w-full cursor-crosshair touch-pan-y rounded-clear-row outline-none select-none focus-visible:ring-3 focus-visible:ring-clear-ember/50"
          style={{ height: HEIGHT }}
        >
          {W > 0 && (
            <svg aria-hidden width={W} height={HEIGHT} className="absolute inset-0 block overflow-visible">
              <line x1={0} x2={W} y1={floor} y2={floor} stroke="var(--clr-line)" />
              {bands.map((b) => (
                <path key={b.id} d={b.d} fill={`var(--clr-${b.tone})`} stroke={`var(--clr-${b.tone}-ink)`} strokeWidth={1.5} strokeLinejoin="round" />
              ))}
              {showBase && <polyline points={baseLine} fill="none" stroke="var(--clr-muted)" strokeWidth={2} strokeDasharray="5 5" strokeLinejoin="round" />}
              <line x1={x(month)} x2={x(month)} y1={PAD.top - 4} y2={floor} stroke="var(--clr-ink)" strokeDasharray="3 3" />
              {dotAt != null && (
                <g>
                  <circle cx={dotAt} cy={floor} r={5} fill="var(--clr-ember)" />
                  <text
                    x={labelLeft ? dotAt - 10 : dotAt + 10}
                    y={floor - 6}
                    textAnchor={labelLeft ? "end" : "start"}
                    fontSize="12"
                    fontWeight={600}
                    fill="var(--clr-ink)"
                  >
                    <SvgMoneyText>{end}</SvgMoneyText>
                  </text>
                </g>
              )}
            </svg>
          )}

          {W > 0 && (
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-1 flex w-max max-w-[min(280px,75%)] flex-col gap-0.5 rounded-clear-row bg-clear-hero px-3 py-2 text-clear-hero-ink",
                flipped ? "-translate-x-[calc(100%+8px)]" : "translate-x-2",
              )}
              style={{ left: x(month) }}
            >
              <span className="text-xs font-medium text-clear-hero-ink-2">{readout.date}</span>
              <span className="text-[13px] font-semibold"><MoneyText>{readout.headline}</MoneyText></span>
              {readout.detail && <span className="text-xs font-medium text-clear-hero-ink-2"><MoneyText>{readout.detail}</MoneyText></span>}
              <span className="text-xs font-medium text-clear-hero-ink-2"><MoneyText>{readout.totals}</MoneyText></span>
            </div>
          )}
        </div>
        <p aria-live="polite" className="sr-only">
          <MoneyText>{hover != null ? [readout.date, readout.headline, readout.detail, readout.totals].filter(Boolean).join(". ") : ""}</MoneyText>
        </p>

        <div aria-hidden className="relative h-4 text-xs tabular-nums text-clear-muted">
          {marks.map((m) => (
            <span
              key={m}
              className={cn("absolute whitespace-nowrap", m / span < 0.08 ? "" : m / span > 0.92 ? "-translate-x-full" : "-translate-x-1/2")}
              style={{ left: `${(m / span) * 100}%` }}
            >
              {date(m)}
            </span>
          ))}
        </div>
      </div>
    </ClearCard>
  );
}

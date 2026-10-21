"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatEurWhole } from "@/lib/format";
import type { simulatePayoff } from "@/lib/debt-simulate";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { MoneyText } from "@/components/clear/money";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { ComputedDebt } from "./debt-shared";
import { ExtraSlider, debtLineColours, monthsFromNow, useMonthYear } from "./debt-ui";

type Sim = ReturnType<typeof simulatePayoff>;

/** A series' value at month `i`; past its end it stays at its last value. */
const at = (series: readonly number[], i: number) => series[Math.min(i, series.length - 1)] ?? 0;

/** Months the charts cover: long enough to show everything ending, capped at 30 years
 *  so a debt that never ends doesn't flatten the rest. */
function chartSpan(base: Sim, sim: Sim) {
  return Math.max(1, Math.min(360, Math.max(sim.totals.length, base.totals.length) - 1));
}

const pct = (i: number, span: number) => `${(i / span) * 100}%`;

// ── The card ──────────────────────────────────────────────────────────────────

/**
 * Plan · Debts' "Payoff timeline" card: the total still owed month by month at the
 * minimums (dashed) and with the simulator's extra (solid, with a peach fill), the
 * debt-free month as an orange dot. The chart has a fixed height; the card fills its
 * column with the two "debt-free" tiles pinned to its bottom. "Open", or a click on
 * the chart, opens the per-debt timeline popup.
 */
export function PayoffCard({
  base,
  sim,
  extra,
  onOpen,
  className,
}: {
  base: Sim;
  sim: Sim;
  extra: number;
  onOpen: () => void;
  className?: string;
}) {
  const t = useTranslations("plan.debts.payoff");
  const monthYear = useMonthYear();
  const span = chartSpan(base, sim);
  const start = sim.totals[0] ?? 0;
  const top = Math.max(1, start);
  const W = 1000;
  const H = 120;
  const x = (i: number) => (i / span) * W;
  const y = (v: number) => 4 + (1 - v / top) * (H - 8);
  const line = (series: readonly number[], end: number) =>
    Array.from({ length: end + 1 }, (_, i) => `${x(i).toFixed(1)},${y(at(series, i)).toFixed(1)}`).join(" ");

  const simEnd = Math.min(span, sim.months ?? span);
  const baseEnd = Math.min(span, base.months ?? span);
  const simLine = line(sim.totals, simEnd);
  const area = `${simLine} ${x(simEnd).toFixed(1)},${H} 0,${H}`;
  const showBase = extra > 0;

  const date = (months: number | null) => (months != null ? monthYear(monthsFromNow(months)) : t("never"));
  // The extra's date sits under its own month, unless it would run into Now or the end.
  const extraAt = showBase && sim.months != null && sim.months <= span ? sim.months / span : null;
  const showExtraLabel = extraAt != null && extraAt > 0.2 && extraAt < 0.78;

  const debtFree = sim.months != null ? t("debtFree", { date: monthYear(monthsFromNow(sim.months)) }) : t("debtFreeNever");
  const sooner = showBase && base.months != null && sim.months != null ? base.months - sim.months : 0;
  const summary = [t("summary", { amount: formatEurWhole(start), end: debtFree }), ...(sooner > 0 ? [t("sooner", { count: sooner, amount: formatEurWhole(extra) })] : [])].join(". ");

  const tile = "flex min-w-0 flex-col gap-0.5 rounded-clear-tile px-3 py-2.5";

  return (
    <ClearCard aria-labelledby="debts-payoff-title" className={cn("gap-3", className)}>
      <ClearCardHeader
        title={<span id="debts-payoff-title">{t("title")}</span>}
        subtitle={<MoneyText>{showBase ? t("subtitleExtra", { amount: formatEurWhole(extra) }) : t("subtitleMinimums")}</MoneyText>}
        action={
          <button type="button" onClick={onOpen} data-tip-anchor="debtsTimeline" className="cursor-pointer text-sm font-bold text-clear-ember-text hover:underline">
            {t("open")}
          </button>
        }
      />

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={onOpen}
          aria-label={t("openLabel")}
          aria-describedby="debts-payoff-summary"
          className="relative block h-[120px] w-full cursor-pointer rounded-clear-row outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50"
        >
          <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
            <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--clr-line)" vectorEffect="non-scaling-stroke" />
            <polygon points={area} style={{ fill: "var(--clr-peach)" }} opacity={0.7} />
            {showBase && (
              <polyline
                points={line(base.totals, baseEnd)}
                fill="none"
                stroke="var(--clr-placeholder)"
                strokeWidth={2.5}
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <polyline points={simLine} fill="none" stroke="var(--clr-ink)" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {sim.months != null && sim.months <= span && (
            <span
              aria-hidden
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-clear-ember"
              style={{ left: pct(sim.months, span), top: `${(y(0) / H) * 100}%` }}
            />
          )}
        </button>
        <div aria-hidden className="relative h-4 text-xs tabular-nums text-clear-muted">
          <span className="absolute left-0">{t("now")}</span>
          {showExtraLabel && (
            <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${extraAt! * 100}%` }}>
              {date(sim.months)}
            </span>
          )}
          <span className="absolute right-0 whitespace-nowrap">{date(base.months)}</span>
        </div>
        <p id="debts-payoff-summary" className="sr-only">
          <MoneyText>{summary}</MoneyText>
        </p>
      </div>

      <div className={cn("mt-auto grid gap-2 pt-1", showBase && "grid-cols-2")}>
        <div className={cn(tile, "bg-clear-tile")}>
          <span className="text-xs font-medium text-clear-muted">{t("atMinimumsLabel")}</span>
          <span className="truncate text-sm font-semibold">{date(base.months)}</span>
        </div>
        {showBase && (
          <div className={cn(tile, "bg-clear-peach text-clear-peach-ink")}>
            <span className="truncate text-xs font-medium"><MoneyText>{t("withExtraLabel", { amount: formatEurWhole(extra) })}</MoneyText></span>
            <span className="truncate text-sm font-semibold">{date(sim.months)}</span>
          </div>
        )}
      </div>
    </ClearCard>
  );
}

// ── The popup ─────────────────────────────────────────────────────────────────

/**
 * Popup · Payoff timeline: every debt's own balance month by month — with the extra
 * solid, at the minimums dashed and faded — in a stable colour per debt, a readout for
 * the month under the pointer (or the arrow keys), a tile per debt with its payoff
 * month and the interest the extra saves on it, and the same "extra each month" slider
 * as the page (one shared value). A centred modal on desktop, a bottom sheet on phones.
 */
export function PayoffTimelineDialog({
  open,
  onOpenChange,
  active,
  base,
  sim,
  extra,
  max,
  onExtra,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: ComputedDebt[];
  base: Sim;
  sim: Sim;
  extra: number;
  max: number;
  onExtra: (n: number) => void;
}) {
  const t = useTranslations("plan.debts.timeline");
  const tPayoff = useTranslations("plan.debts.payoff");
  const tSim = useTranslations("plan.debts.simulator");
  const tClose = useTranslations("debtForm");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideHeaderRow title={tPayoff("title")} className="gap-4 pt-6" sheetClassName="lg:w-[760px]">
        <ClearDialogHeader
          title={tPayoff("title")}
          subtitle={extra > 0 ? t("subtitleExtra", { amount: formatEurWhole(extra) }) : t("subtitleMinimums")}
          onClose={() => onOpenChange(false)}
          closeLabel={tClose("close")}
        />
        <TimelineBody active={active} base={base} sim={sim} extra={extra} />
        <div className="flex items-center gap-4 rounded-clear-tile bg-clear-tile px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label htmlFor="debt-extra-timeline" className="text-xs font-semibold text-clear-ink-2">
              {tSim("extra")}
            </label>
            <ExtraSlider id="debt-extra-timeline" value={extra} max={max} onChange={onExtra} valueText={tSim("valueText", { amount: formatEurWhole(extra) })} />
          </div>
          <Amount value={extra} whole splitCents={false} sign="none" className="text-[22px] leading-none tracking-[-0.03em]" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TimelineBody({ active, base, sim, extra }: { active: ComputedDebt[]; base: Sim; sim: Sim; extra: number }) {
  const t = useTranslations("plan.debts.timeline");
  const tPayoff = useTranslations("plan.debts.payoff");
  const locale = useLocale();
  const monthYear = useMonthYear();
  const list = useMemo(() => new Intl.ListFormat(locale, { type: "conjunction" }), [locale]);

  const span = chartSpan(base, sim);
  const colours = useMemo(() => debtLineColours(active.map((c) => c.debt.id)), [active]);
  const baseById = new Map(base.byDebt.map((d) => [d.id, d]));
  // In the list's order, so the tiles and the readout read like the page.
  const debts = active.flatMap((c) => {
    const s = sim.byDebt.find((d) => d.id === c.debt.id);
    const b = baseById.get(c.debt.id);
    return s && b ? [{ c, s, b, colour: colours.get(c.debt.id)! }] : [];
  });

  const W = 1000;
  const H = 220;
  const top = Math.max(1, ...debts.map((d) => d.s.balances[0] ?? 0));
  const x = (i: number) => (i / span) * W;
  const y = (v: number) => 6 + (1 - v / top) * (H - 12);
  // Each line ends where its debt reaches zero.
  const line = (series: readonly number[], months: number | null) =>
    Array.from({ length: Math.min(span, months ?? span) + 1 }, (_, i) => `${x(i).toFixed(1)},${y(at(series, i)).toFixed(1)}`).join(" ");

  // The readout starts on the first payoff, so the popup opens on something to read.
  const firstPayoff = Math.min(span, ...debts.map((d) => d.s.months ?? span).filter((m) => m > 0));
  const [hover, setHover] = useState<number | null>(null);
  const month = hover ?? firstPayoff;

  const readout = (() => {
    const finished = debts.filter((d) => month > 0 && d.s.months === month);
    const left = Math.round(at(sim.totals, month));
    const headline =
      finished.length > 0
        ? t("paidOff", { names: list.format(finished.map((d) => d.c.debt.name)) })
        : left <= 0
          ? t("debtFree")
          : t("leftTotal", { amount: formatEurWhole(left) });
    const detail = debts
      .filter((d) => !finished.includes(d))
      .map((d) =>
        d.s.months != null && d.s.months <= month ? t("done", { name: d.c.debt.name }) : t("left", { name: d.c.debt.name, amount: formatEurWhole(at(d.s.balances, month)) }),
      )
      .join(" · ");
    return { date: month === 0 ? t("now") : monthYear(monthsFromNow(month)), headline, detail };
  })();

  function pick(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0) return;
    setHover(Math.max(0, Math.min(span, Math.round(((e.clientX - r.left) / r.width) * span))));
  }

  function step(e: React.KeyboardEvent<HTMLDivElement>) {
    const by: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, PageUp: 12, PageDown: -12 };
    let next: number | null = null;
    if (e.key in by) next = month + by[e.key];
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = span;
    if (next == null) return;
    e.preventDefault();
    setHover(Math.max(0, Math.min(span, next)));
  }

  // Axis labels: now, the end of the chart, then the debt-free month with the extra and
  // the first payoff — each only where it doesn't run into one already placed.
  const marks: number[] = [];
  for (const m of [0, base.months != null ? Math.min(span, base.months) : null, sim.months, firstPayoff]) {
    if (m == null || m > span) continue;
    if (marks.every((p) => Math.abs(p - m) / span >= 0.16)) marks.push(m);
  }
  marks.sort((a, z) => a - z);

  const summary = [
    tPayoff("summary", { amount: formatEurWhole(sim.totals[0] ?? 0), end: sim.months != null ? tPayoff("debtFree", { date: monthYear(monthsFromNow(sim.months)) }) : tPayoff("debtFreeNever") }),
    ...debts.map((d) =>
      d.s.months != null ? tPayoff("summaryDebt", { name: d.c.debt.name, date: monthYear(monthsFromNow(d.s.months)) }) : tPayoff("summaryDebtNever", { name: d.c.debt.name }),
    ),
  ].join(". ");

  const flipped = month / span > 0.55;
  const showBase = extra > 0;

  return (
    <>
      <ul aria-hidden className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-xs font-medium text-clear-ink-2">
        {debts.map((d) => (
          <li key={d.c.debt.id} className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-3.5 shrink-0 rounded-full" style={{ background: d.colour }} />
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

      <div className="flex flex-col gap-1.5">
        <div
          role="group"
          tabIndex={0}
          aria-label={`${summary}. ${t("keys")}`}
          onPointerDown={pick}
          onPointerMove={pick}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setHover(null);
          }}
          onKeyDown={step}
          className="relative h-[200px] w-full cursor-crosshair touch-pan-y rounded-clear-row outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50 lg:h-[220px]"
        >
          <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
            <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--clr-line)" vectorEffect="non-scaling-stroke" />
            {sim.months != null && sim.months <= span && (
              <line x1={x(sim.months)} x2={x(sim.months)} y1={0} y2={y(0)} stroke="var(--clr-line)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
            )}
            {showBase &&
              debts.map((d) => (
                <polyline
                  key={`b${d.c.debt.id}`}
                  points={line(d.b.balances, d.b.months)}
                  fill="none"
                  stroke={d.colour}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  opacity={0.5}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            {debts.map((d) => (
              <polyline
                key={`s${d.c.debt.id}`}
                points={line(d.s.balances, d.s.months)}
                fill="none"
                stroke={d.colour}
                strokeWidth={2.5}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <line x1={x(month)} x2={x(month)} y1={0} y2={y(0)} stroke="var(--clr-ink)" strokeOpacity={0.35} vectorEffect="non-scaling-stroke" />
          </svg>

          {/* Where each debt stands in the readout's month */}
          {debts.map((d) =>
            d.s.months == null || d.s.months >= month ? (
              <span
                key={`p${d.c.debt.id}`}
                aria-hidden
                className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-clear-card"
                style={{ left: pct(month, span), top: `${(y(at(d.s.balances, month)) / H) * 100}%`, borderColor: d.colour }}
              />
            ) : null,
          )}

          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1 flex max-w-[min(260px,70%)] flex-col gap-0.5 rounded-clear-row bg-clear-hero px-3 py-2 text-clear-hero-ink",
              flipped ? "-translate-x-[calc(100%+8px)]" : "translate-x-2",
            )}
            style={{ left: pct(month, span) }}
          >
            <span className="text-xs font-medium text-clear-hero-ink-2">{readout.date}</span>
            <span className="text-[13px] font-semibold"><MoneyText>{readout.headline}</MoneyText></span>
            {readout.detail && <span className="text-xs font-medium text-clear-hero-ink-2"><MoneyText>{readout.detail}</MoneyText></span>}
          </div>
        </div>
        <p aria-live="polite" className="sr-only">
          <MoneyText>{hover != null ? [readout.date, readout.headline, readout.detail].filter(Boolean).join(". ") : ""}</MoneyText>
        </p>

        <div aria-hidden className="relative h-4 text-xs tabular-nums text-clear-muted">
          {marks.map((m) => (
            <span
              key={m}
              className={cn("absolute whitespace-nowrap", m / span < 0.08 ? "" : m / span > 0.92 ? "-translate-x-full" : "-translate-x-1/2")}
              style={{ left: pct(m, span) }}
            >
              {m === 0 ? t("now") : monthYear(monthsFromNow(m))}
            </span>
          ))}
        </div>
      </div>

      <ul className="m-0 grid list-none gap-2.5 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {debts.map((d) => {
          const saved = Math.max(0, Math.round(d.b.interest - d.s.interest));
          const rate = d.c.debt.interestRate ?? 0;
          return (
            <li key={d.c.debt.id} className="flex min-w-0 flex-col gap-1 rounded-clear-tile bg-clear-tile px-3.5 py-3">
              <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-clear-ink-2">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: d.colour }} />
                <span className="truncate">{d.c.debt.name}</span>
              </span>
              <span className="text-sm font-semibold">
                <MoneyText>
                  {d.s.months == null
                    ? t("never")
                    : [t("free", { date: monthYear(monthsFromNow(d.s.months)) }), rate > 0 ? t("saved", { amount: formatEurWhole(saved) }) : t("noInterest")].join(" · ")}
                </MoneyText>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

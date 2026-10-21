"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { SvgMoneyText } from "@/components/clear/money";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { niceStep } from "@/app/forecast/cash-flow-chart";
import { dotSize } from "@/lib/upcoming-plan";
import { formatCompactEur, formatEurWhole } from "@/lib/format";
import { shiftDate } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import type { UpcomingBill, UpcomingData } from "./upcoming-view";
import { useDates } from "./use-dates";

const PAD = { left: 44, right: 14, top: 30, bottom: 46 };
const HEIGHT = 200;
/** The height of the "Lowest" pill. */
const LOW_H = 22;

/** A bill's dot colour under the chart: paid, to pay, overdue or income (ringed). */
function dotStyle(b: UpcomingBill): { fill: string; stroke?: string } {
  if (b.isIncome) return { fill: "var(--clr-card)", stroke: "var(--clr-positive)" };
  if (b.paid) return { fill: "var(--clr-positive-fill)" };
  if (b.overdue) return { fill: "var(--clr-negative)" };
  return { fill: "var(--clr-ember)" };
}

/** Sign first, with a real minus: "−€1.204". */
const signed = (v: number) => `${v < 0 ? "−" : ""}${formatEurWhole(Math.abs(v))}`;

/**
 * The checking balance through the month: what it was each day so far (solid, over a
 * faint fill) and, from today, a step for every bill and income still to come (dashed),
 * with today, the lowest point and the biggest income named. The dots underneath are
 * the month's bills, coloured by status. Drawn in real pixels (ResizeObserver) so the
 * 12px labels stay 12px on a phone.
 */
export function BalanceCard({ data, className }: { data: UpcomingData; className?: string }) {
  const t = useTranslations("upcoming.balance");
  const d = useDates();
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const series = data.series;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [series]);

  const account = data.account?.name ?? t("accounts", { count: data.account?.count ?? 0 });

  let chart: React.ReactNode = null;
  let description = "";
  if (series && width > 0) {
    const days: string[] = [];
    for (let day = data.from; day <= data.to; day = shiftDate(day, 1)) days.push(day);
    const index = new Map(days.map((day, i) => [day, i]));
    const W = width;
    const plotW = W - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const values = [...series.past, ...series.future].map((p) => p.balance);
    let lo = Math.min(0, ...values);
    let hi = Math.max(0, ...values);
    if (hi - lo < 1) hi = lo + 100;
    const step = niceStep((hi - lo) / 3);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);

    const n = days.length;
    const x = (day: string) => PAD.left + ((index.get(day) ?? 0) / Math.max(1, n - 1)) * plotW;
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;
    const bottom = PAD.top + plotH;

    const past = series.past;
    const line = past.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
    const area = past.length > 1 ? `${line} L${x(past.at(-1)!.date).toFixed(1)},${bottom} L${x(past[0].date).toFixed(1)},${bottom} Z` : "";

    const balanceNow = data.account?.balance ?? 0;
    const showToday = data.period === "current";
    const todayX = x(data.today);
    let steps = "";
    if (showToday && series.future.length > 0) {
      steps = `M${todayX.toFixed(1)},${y(balanceNow).toFixed(1)}`;
      for (const p of series.future) steps += ` H${x(p.date).toFixed(1)} V${y(p.balance).toFixed(1)}`;
    }

    // The biggest income still to come, named at its step.
    const income = data.bills
      .filter((b) => b.isIncome && !b.paid && !b.skipped && b.dueDate != null && b.dueDate >= data.today && b.amount != null)
      .sort((a, z) => (z.amount ?? 0) - (a.amount ?? 0))[0];
    const incomePoint = income ? series.future.find((p) => p.date === income.dueDate) : undefined;

    // One dot per bill under the chart; several on a day sit side by side.
    const perDay = new Map<string, UpcomingBill[]>();
    for (const b of data.bills) if (b.dueDate && !b.skipped && index.has(b.dueDate)) perDay.set(b.dueDate, [...(perDay.get(b.dueDate) ?? []), b]);

    // Day labels: the 1st of the period, every seventh day after it and today.
    const labelDays = days.filter((_, i) => i % 7 === 0);
    const todayLabel = d.short(data.today);
    const lowest = series.lowest;
    const pill = showToday ? t("today", { amount: signed(balanceNow) }) : null;
    const pillW = pill ? pill.length * 7 + 22 : 0;
    const pillX = Math.min(Math.max(todayX - pillW / 2, PAD.left), W - PAD.right - pillW);

    // The lowest point's pill: under the point, above it when it would run into the axis,
    // and beside it (right, else left) when centring it would clip at an edge.
    let low: { x: number; y: number; w: number; px: number; py: number; label: string } | null = null;
    if (lowest) {
      const label = t("lowest", { amount: signed(lowest.balance) });
      const w = label.length * 7 + 20;
      const px = x(lowest.date);
      const py = y(lowest.balance);
      let lx = px - w / 2;
      let ly = py + 10 + LOW_H > bottom ? py - 10 - LOW_H : py + 10;
      if (lx < 2 || lx + w > W - 2) {
        lx = px + 10 + w <= W - 2 ? px + 10 : px - 10 - w;
        ly = py - LOW_H / 2;
      }
      lx = Math.min(Math.max(lx, 2), W - 2 - w);
      ly = Math.min(Math.max(ly, 2), bottom - LOW_H);
      low = { x: lx, y: ly, w, px, py, label };
    }

    description = t("description", {
      account,
      now: signed(balanceNow),
      lowest: lowest ? signed(lowest.balance) : signed(balanceNow),
      date: lowest ? d.short(lowest.date) : todayLabel,
    });

    chart = (
      <svg width={W} height={HEIGHT} role="img" aria-label={description} className="block font-clear">
        {ticks.map((v, i) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--clr-line)" strokeDasharray={i === 0 ? undefined : "3 4"} />
            <text x={PAD.left - 10} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--clr-muted)">
              <SvgMoneyText>{formatCompactEur(v)}</SvgMoneyText>
            </text>
          </g>
        ))}
        {area && <path d={area} fill="var(--clr-ground)" />}
        {line && <path d={line} fill="none" stroke="var(--clr-ink)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />}
        {steps && <path d={steps} fill="none" stroke="var(--clr-ink)" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />}

        {showToday && (
          <>
            <line x1={todayX} x2={todayX} y1={PAD.top - 4} y2={bottom + 6} stroke="var(--clr-ink)" strokeDasharray="2 3" />
            <rect x={pillX} y={4} width={pillW} height={22} rx={11} fill="var(--clr-primary)" />
            <text x={pillX + pillW / 2} y={19} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--clr-primary-ink)">
              <SvgMoneyText>{pill!}</SvgMoneyText>
            </text>
          </>
        )}

        {income && incomePoint && (
          <>
            <circle cx={x(incomePoint.date)} cy={y(incomePoint.balance)} r={4} fill="var(--clr-positive)" />
            <text
              x={x(incomePoint.date) - 8}
              y={Math.max(14, y(incomePoint.balance) - 8)}
              textAnchor="end"
              fontSize="12"
              fontWeight="700"
              fill="var(--clr-positive)"
            >
              <SvgMoneyText>{`${income.name} +${formatEurWhole(income.amount!)}`}</SvgMoneyText>
            </text>
          </>
        )}

        {[...perDay].map(([day, list]) =>
          list.map((b, i) => {
            const s = dotStyle(b);
            const r = dotSize(b.amount) / 2 + 0.5;
            return (
              <circle
                key={`${b.id}-${day}-${i}`}
                cx={x(day) + (i - (list.length - 1) / 2) * 8}
                cy={bottom + 14}
                r={r}
                fill={s.fill}
                stroke={s.stroke}
                strokeWidth={s.stroke ? 1.8 : undefined}
              />
            );
          }),
        )}

        {labelDays.map((day) => (
          <text key={day} x={x(day)} y={HEIGHT - 6} textAnchor="middle" fontSize="12" fill="var(--clr-muted)">
            {day === data.from ? d.short(day) : day.slice(8).replace(/^0/, "")}
          </text>
        ))}
        {showToday && !labelDays.includes(data.today) && (
          <text x={todayX} y={HEIGHT - 6} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--clr-ink)">
            {data.today.slice(8).replace(/^0/, "")}
          </text>
        )}

        {/* Last, so the line never crosses it: a card-coloured pill with the dot on top. */}
        {low && (
          <g>
            <rect x={low.x} y={low.y} width={low.w} height={LOW_H} rx={LOW_H / 2} fill="var(--clr-card)" stroke="var(--clr-line)" />
            <text x={low.x + low.w / 2} y={low.y + 15} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--clr-ink)">
              <SvgMoneyText>{low.label}</SvgMoneyText>
            </text>
            <circle cx={low.px} cy={low.py} r={4.5} fill="var(--clr-card)" stroke="var(--clr-ink)" strokeWidth="2" />
          </g>
        )}
      </svg>
    );
  }

  return (
    <ClearCard aria-labelledby="upcoming-balance-title" className={cn("gap-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ClearCardHeader
          title={<span id="upcoming-balance-title">{t("title", { month: data.monthName })}</span>}
          subtitle={series ? t("subtitle", { account }) : undefined}
        />
        {series && (
          <div aria-hidden className="flex gap-3.5 pt-1 text-xs font-semibold whitespace-nowrap text-clear-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <svg width="20" height="8"><path d="M1 4h18" stroke="var(--clr-ink)" strokeWidth="2.2" strokeLinecap="round" /></svg>
              {t("soFar")}
            </span>
            {data.period === "current" && (
              <span className="inline-flex items-center gap-1.5">
                <svg width="20" height="8"><path d="M1 4h18" stroke="var(--clr-ink)" strokeWidth="2" strokeDasharray="4 3" /></svg>
                {t("afterBills")}
              </span>
            )}
          </div>
        )}
      </div>
      {series ? (
        <div ref={boxRef} className="min-h-[200px] w-full min-w-0">
          {chart}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-start justify-center gap-3 rounded-clear-tile bg-clear-tile p-4">
          <p className="m-0 text-sm text-clear-ink-2">{t("noBalance")}</p>
          <Link href="/settings?panel=accounts" className={clearButtonVariants({ variant: "surface", size: "sm" })}>
            {t("setBalance")}
          </Link>
        </div>
      )}
    </ClearCard>
  );
}

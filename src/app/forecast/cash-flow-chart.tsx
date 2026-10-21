"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatCompactEur, formatEur, formatEurWhole } from "@/lib/format";
import type { ForecastEvent, ForecastPoint } from "@/lib/cash-flow-forecast-shared";
import { SvgMoneyText, MoneyText } from "@/components/clear/money";

// The projected balance, day by day from today: the ink line over a faint fill, a dot
// on every day money moves (green in, ringed out), the lowest point pinned with an
// ember dot and a black pill, the biggest payday labelled in mint, the safety line
// dashed in red and, once the line heads below it, the overdraft limit in solid red. Drawn in real pixels (measured with a ResizeObserver) rather than a
// scaled viewBox, so the 12px labels stay 12px on a phone. Colours are theme tokens.

const PAD = { left: 52, right: 12, top: 16, bottom: 30 };

/** A step of 1, 2, 2.5 or 5 × 10ⁿ, so the gridlines land on round amounts. */
export function niceStep(raw: number) {
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

/** Sign first, with a real minus: "−€1.204", "+€3.650". */
function signed(value: number, whole: boolean, plus = false) {
  const body = whole ? formatEurWhole(Math.abs(value)) : formatEur(Math.abs(value));
  return `${value < 0 ? "−" : plus && value > 0 ? "+" : ""}${body}`;
}

function pillWidth(text: string) {
  return Math.round(text.length * 6.9 + 24);
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function CashFlowChart({
  points,
  events,
  safety,
  overdraftLimit,
  label,
}: {
  points: ForecastPoint[];
  events: ForecastEvent[];
  /** Where the dashed safety line sits (see safetyLine), or null for none. */
  safety: number | null;
  /** Combined overdraft limit as a positive amount; 0 = none. */
  overdraftLimit: number;
  /** Already translated description of the chart for screen readers. */
  label: string;
}) {
  const t = useTranslations("insights.forecast.chart");
  const locale = useLocale();
  const dateLocale = locale === "nl" ? "nl-NL" : "en-GB";
  const gradientId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const shortDate = (date: string) => new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
  const longDate = (date: string) => new Intl.DateTimeFormat(dateLocale, { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));

  const eventsByDate = new Map<string, ForecastEvent[]>();
  for (const e of events) eventsByDate.set(e.date, [...(eventsByDate.get(e.date) ?? []), e]);

  let chart: React.ReactNode = null;
  let tooltip: React.ReactNode = null;

  if (size && size.w > 0 && size.h > 0 && points.length > 0) {
    const { w: W, h: H } = size;
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const n = points.length;
    const values = points.map((p) => p.amount);

    // The overdraft limit only earns room on the axis once the line comes under the
    // safety line (or zero); above that it would just squash the chart.
    const showLimit = overdraftLimit > 0 && Math.min(...values) < Math.max(0, safety ?? 0);
    let lo = Math.min(0, ...values, showLimit ? -overdraftLimit : 0, safety ?? 0);
    let hi = Math.max(...values, safety != null && safety > 0 ? safety : 0);
    if (hi - lo < 1) hi = lo + 100;
    const step = niceStep((hi - lo) / 4);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);

    const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;
    const bottom = y(lo);

    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.amount).toFixed(1)}`).join(" ");
    const area = `${line} L${x(n - 1).toFixed(1)},${bottom.toFixed(1)} L${x(0).toFixed(1)},${bottom.toFixed(1)} Z`;

    // Labels placed so far, so the next one can step aside instead of overlapping.
    const placed: Box[] = [];

    // Today: the starting balance, written next to the first point.
    const todayY = y(points[0].amount);
    const todayText = signed(points[0].amount, false);
    const todayBox: Box = { x: x(0) + 10, y: todayY - 26 < PAD.top ? todayY + 8 : todayY - 26, w: todayText.length * 7.6, h: 18 };
    placed.push(todayBox);

    // The lowest point, when the line actually dips below where it starts.
    let lowestIdx = 0;
    for (let i = 1; i < n; i++) if (points[i].amount < points[lowestIdx].amount) lowestIdx = i;
    let lowest: { cx: number; cy: number; box: Box; text: string } | null = null;
    if (lowestIdx > 0) {
      const text = t("lowestPill", { amount: signed(points[lowestIdx].amount, true), date: shortDate(points[lowestIdx].date) });
      const w = pillWidth(text);
      const cx = x(lowestIdx);
      const cy = y(points[lowestIdx].amount);
      const right = cx + 16 + w <= W - PAD.right;
      const box: Box = { x: right ? cx + 16 : Math.max(PAD.left, cx - 16 - w), y: Math.min(Math.max(cy - 13, PAD.top), PAD.top + plotH - 26), w, h: 26 };
      lowest = { cx, cy, box, text };
      placed.push(box);
    }

    // The biggest day of money coming in, labelled with its largest payment.
    let incomeIdx = -1;
    for (let i = 1; i < n; i++) if (points[i].change > 0 && (incomeIdx === -1 || points[i].change > points[incomeIdx].change)) incomeIdx = i;
    let income: { cx: number; cy: number; box: Box; text: string } | null = null;
    if (incomeIdx > 0) {
      const top = [...(eventsByDate.get(points[incomeIdx].date) ?? [])].filter((e) => e.amount > 0).sort((a, b) => b.amount - a.amount)[0];
      if (top) {
        const text = `${top.name} ${signed(top.amount, true, true)}`;
        const w = pillWidth(text);
        const cx = x(incomeIdx);
        const cy = y(points[incomeIdx].amount);
        const above = cy - 40 >= PAD.top;
        const box: Box = { x: Math.min(Math.max(cx - w / 2, PAD.left), W - PAD.right - w), y: above ? cy - 40 : cy + 14, w, h: 24 };
        if (!placed.some((b) => overlaps(b, box))) income = { cx, cy, box, text };
      }
    }

    const midCount = W < 480 ? 1 : 3;
    const xLabels = [0, ...Array.from({ length: midCount }, (_, j) => Math.round(((j + 1) * (n - 1)) / (midCount + 1))), n - 1];

    const hovered = hover != null ? points[hover] : null;

    chart = (
      <svg
        width={W}
        height={H}
        role="img"
        aria-label={label}
        className="block touch-pan-y select-none"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - rect.left - PAD.left) / plotW) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - rect.left - PAD.left) / plotW) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
        // A tap on a phone ends with a leave; keep that day's tooltip until the next tap.
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setHover(null);
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--clr-ink)", stopOpacity: 0.08 }} />
            <stop offset="1" style={{ stopColor: "var(--clr-ink)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        {ticks.map((v, i) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--clr-line)" strokeDasharray={i === 0 ? undefined : "3 4"} />
            <text x={PAD.left - 10} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--clr-muted)">
              <SvgMoneyText>{formatCompactEur(v)}</SvgMoneyText>
            </text>
          </g>
        ))}

        {/* Below zero: the line where the money runs out. */}
        {lo < 0 && <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--clr-negative-fill)" strokeOpacity={0.5} />}

        {safety != null && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(safety)} y2={y(safety)} stroke="var(--clr-negative-fill)" strokeWidth={1.5} strokeDasharray="6 5" />
            <text x={W - PAD.right} y={y(safety) - 7} textAnchor="end" fontSize="12" fontWeight={700} fill="var(--clr-negative)">
              <SvgMoneyText>{t("safety", { amount: signed(safety, true) })}</SvgMoneyText>
            </text>
          </g>
        )}

        {showLimit && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(-overdraftLimit)} y2={y(-overdraftLimit)} stroke="var(--clr-negative-fill)" strokeWidth={2} />
            <text x={W - PAD.right} y={y(-overdraftLimit) + 16 > PAD.top + plotH ? y(-overdraftLimit) - 7 : y(-overdraftLimit) + 16} textAnchor="end" fontSize="12" fontWeight={700} fill="var(--clr-negative)">
              <SvgMoneyText>{t("overdraftLimit", { amount: signed(-overdraftLimit, true) })}</SvgMoneyText>
            </text>
          </g>
        )}

        {/* Today */}
        <line x1={x(0)} x2={x(0)} y1={PAD.top} y2={bottom} stroke="var(--clr-placeholder)" strokeWidth={1.5} strokeDasharray="4 4" />

        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke="var(--clr-ink)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) =>
          i === 0 || p.change === 0 ? null : p.change > 0 ? (
            <circle key={p.date} cx={x(i)} cy={y(p.amount)} r={5} fill="var(--clr-positive-fill)" stroke="var(--clr-card)" strokeWidth={2} />
          ) : (
            <circle key={p.date} cx={x(i)} cy={y(p.amount)} r={3.5} fill="var(--clr-card)" stroke="var(--clr-ink)" strokeWidth={2} />
          ),
        )}

        <circle cx={x(0)} cy={todayY} r={6} fill="var(--clr-ink)" stroke="var(--clr-card)" strokeWidth={2.5} />
        <text x={todayBox.x} y={todayBox.y + 13} fontSize="13" fontWeight={800} fill="var(--clr-ink)">
          <SvgMoneyText>{todayText}</SvgMoneyText>
        </text>

        {lowest && (
          <g>
            <line
              x1={lowest.cx}
              y1={lowest.cy}
              x2={lowest.box.x > lowest.cx ? lowest.box.x : lowest.box.x + lowest.box.w}
              y2={lowest.box.y + 13}
              stroke="var(--clr-ink)"
              strokeWidth={1.5}
            />
            <circle cx={lowest.cx} cy={lowest.cy} r={6.5} fill="var(--clr-ember)" stroke="var(--clr-card)" strokeWidth={2.5} />
            <rect x={lowest.box.x} y={lowest.box.y} width={lowest.box.w} height={26} rx={13} fill="var(--clr-primary)" />
            <text x={lowest.box.x + lowest.box.w / 2} y={lowest.box.y + 17.5} textAnchor="middle" fontSize="12" fontWeight={700} fill="var(--clr-primary-ink)">
              <SvgMoneyText>{lowest.text}</SvgMoneyText>
            </text>
          </g>
        )}

        {income && (
          <g>
            <rect x={income.box.x} y={income.box.y} width={income.box.w} height={24} rx={12} fill="var(--clr-mint)" />
            <text x={income.box.x + income.box.w / 2} y={income.box.y + 16.5} textAnchor="middle" fontSize="12" fontWeight={800} fill="var(--clr-mint-ink)">
              <SvgMoneyText>{income.text}</SvgMoneyText>
            </text>
            <circle cx={income.cx} cy={income.cy} r={6.5} fill="var(--clr-positive-fill)" stroke="var(--clr-card)" strokeWidth={2.5} />
          </g>
        )}

        {xLabels.map((i, j) => (
          <text
            key={`${i}-${j}`}
            x={x(i)}
            y={H - 8}
            textAnchor={j === 0 ? "start" : j === xLabels.length - 1 ? "end" : "middle"}
            fontSize="12"
            fontWeight={j === 0 ? 700 : 400}
            fill={j === 0 ? "var(--clr-ink)" : "var(--clr-muted)"}
          >
            {j === 0 ? t("today") : shortDate(points[i].date)}
          </text>
        ))}

        {hovered && hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={bottom} stroke="var(--clr-ink)" strokeOpacity={0.3} />
            <circle cx={x(hover)} cy={y(hovered.amount)} r={5} fill="var(--clr-ink)" stroke="var(--clr-card)" strokeWidth={2} />
          </g>
        )}
      </svg>
    );

    if (hovered && hover != null) {
      const dayEvents = eventsByDate.get(hovered.date) ?? [];
      const flip = x(hover) > W - 220;
      tooltip = (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 flex w-[200px] flex-col gap-1 rounded-clear-tile border border-clear-line bg-clear-card px-3.5 py-2.5 text-[13px] shadow-clear-dialog"
          style={{ top: PAD.top, left: flip ? x(hover) - 212 : x(hover) + 12 }}
        >
          <span className="text-xs font-semibold text-clear-muted">{hover === 0 ? t("today") : longDate(hovered.date)}</span>
          <span className="clear-amount text-base"><MoneyText>{signed(hovered.amount, false)}</MoneyText></span>
          {dayEvents.slice(0, 4).map((e) => (
            <span key={e.key} className="flex min-w-0 items-center gap-2">
              <span className={e.amount >= 0 ? "size-2 shrink-0 rounded-full bg-clear-positive-fill" : "size-2 shrink-0 rounded-full bg-clear-ink"} />
              <span className="truncate text-clear-ink-2">{e.name}</span>
              <span className={e.amount >= 0 ? "ml-auto shrink-0 font-bold tabular-nums text-clear-positive" : "ml-auto shrink-0 font-bold tabular-nums"}><MoneyText>{signed(e.amount, false, true)}</MoneyText></span>
            </span>
          ))}
          {dayEvents.length > 4 && <span className="text-xs text-clear-muted">{t("more", { count: dayEvents.length - 4 })}</span>}
        </div>
      );
    }
  }

  return (
    <div ref={boxRef} className="relative mt-auto min-h-[220px] flex-1 lg:min-h-[280px]">
      <div className="absolute inset-0">{chart}</div>
      {tooltip}
    </div>
  );
}

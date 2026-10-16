"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Amount } from "@/components/clear/amount";
import { DeltaChip } from "@/components/clear/chip";
import { AnchoredTip } from "@/components/anchored-tip";
import { currencySymbol, formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MoneyText } from "@/components/clear/money";

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  netWorth: number;
}

const DAY = 86_400_000;
const time = (date: string) => new Date(`${date}T12:00:00`).getTime();

/** 1, 2, 2.5 or 5 times a power of ten, so gridlines land on round numbers. */
function niceStep(raw: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

/** Where a label sits on its x: flush left near the start, flush right near the end. */
function alignAt(x: number) {
  return x < 6 ? "" : x > 94 ? "-translate-x-full" : "-translate-x-1/2";
}

/**
 * A balance over time in the Clear style: a solid line over a soft wash for what was
 * recorded and, dashed, a forecast continuing from its last point. Lines are drawn in a
 * stretched SVG (so the chart fills whatever height it gets); dots, labels and the hover
 * read-out are HTML on top so they never distort. `onHero` switches to the hero card's
 * colours. Used by Insights · Net worth (the hero) and the Forecast tab.
 */
export function NetWorthTrendChart({
  data,
  forecast,
  onHero = false,
  marker,
  endLabel,
  ariaLabel,
  className,
}: {
  data: TrendPoint[];
  forecast?: TrendPoint[];
  onHero?: boolean;
  /** A point to call out with a dashed line and a label ("30 days ago · €14.645"). */
  marker?: { date: string; label: string };
  /** Label above the last recorded point ("Today · €15.057"). */
  endLabel?: string;
  ariaLabel?: string;
  /** Size the chart; it is 190px tall unless the caller gives it a height or lets it flex. */
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("insights");
  const gradientId = `nw-fill-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [hover, setHover] = useState<number | null>(null);

  const points = [
    ...data.map((p) => ({ ...p, forecast: false })),
    ...(forecast ?? []).map((p) => ({ ...p, forecast: true })),
  ];
  if (data.length === 0 || points.length < 2) return null;

  const t0 = time(points[0].date);
  const t1 = time(points[points.length - 1].date);
  const span = Math.max(t1 - t0, DAY);
  const px = (date: string) => ((time(date) - t0) / span) * 100;

  const values = points.map((p) => p.netWorth);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 1) {
    const pad = Math.max(50, Math.abs(hi) * 0.05);
    lo -= pad;
    hi += pad;
  }
  // Headroom above for the end label, a little room below so the line never sits on the axis.
  const dMin = lo - (hi - lo) * 0.12;
  const dMax = hi + (hi - lo) * 0.2;
  const step = niceStep((dMax - dMin) / 3);
  const ticks: number[] = [];
  for (let v = Math.ceil(dMin / step) * step; v <= dMax; v += step) ticks.push(v);
  const py = (v: number) => (1 - (v - dMin) / (dMax - dMin)) * 100;

  const last = data[data.length - 1];
  const actualLine = data.map((p) => `${px(p.date)},${py(p.netWorth)}`).join(" ");
  const forecastLine = forecast?.length
    ? [last, ...forecast].map((p) => `${px(p.date)},${py(p.netWorth)}`).join(" ")
    : null;

  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const tickLabel = (v: number) => `${v < 0 ? "−" : ""}${currencySymbol()}${compact.format(Math.abs(v))}`;
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short" });
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const fullFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const asDate = (d: string) => new Date(`${d}T12:00:00`);

  // Month names at each month start over longer spans; a few spread dates over short ones.
  const spanDays = (t1 - t0) / DAY;
  const lastMonth = last.date.slice(0, 7);
  let xTicks: { key: string; x: number; label: string; current: boolean }[];
  if (spanDays > 50) {
    const months: { key: string; x: number; label: string; current: boolean }[] = [];
    const first = asDate(points[0].date);
    for (let d = new Date(first.getFullYear(), first.getMonth() + 1, 1, 12); d.getTime() <= t1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, x: ((d.getTime() - t0) / span) * 100, label: monthFmt.format(d), current: key === lastMonth });
    }
    const every = Math.ceil(months.length / 7);
    xTicks = months.filter((_, i) => i % every === 0);
  } else {
    const count = Math.min(5, points.length);
    const picked = new Set(Array.from({ length: count }, (_, i) => Math.round((i * (points.length - 1)) / Math.max(1, count - 1))));
    xTicks = [...picked].map((i) => ({ key: points[i].date, x: px(points[i].date), label: dayFmt.format(asDate(points[i].date)), current: false }));
  }

  const ink = onHero ? "var(--clr-hero-ink)" : "var(--clr-ink)";
  const soft = onHero ? "var(--clr-hero-ink-2)" : "var(--clr-muted)";
  const grid = onHero ? "color-mix(in srgb, var(--clr-hero-ink) 14%, transparent)" : "var(--clr-line)";
  const textMuted = onHero ? "text-clear-hero-ink-2" : "text-clear-muted";
  const textStrong = onHero ? "text-clear-hero-ink" : "text-clear-ink";
  const ring = onHero ? "border-clear-hero" : "border-clear-card";

  const markerPoint = marker ? data.find((p) => p.date === marker.date) : undefined;
  const hovered = hover != null ? points[hover] : null;

  const description =
    ariaLabel ??
    t("netWorth.chartDescription", {
      from: fullFmt.format(asDate(points[0].date)),
      to: fullFmt.format(asDate(last.date)),
      start: formatEurWhole(data[0].netWorth),
      end: formatEurWhole(last.netWorth),
    });

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(px(points[i].date) - x) < Math.abs(px(points[best].date) - x)) best = i;
    }
    setHover(best);
  }

  return (
    <div role="img" aria-label={description} className={cn("flex h-[190px] min-h-0 flex-col gap-2 font-clear", className)}>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full overflow-visible">
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={ink} stopOpacity={onHero ? 0.22 : 0.1} />
                <stop offset="1" stopColor={ink} stopOpacity={0} />
              </linearGradient>
            </defs>
            {ticks.map((v) => (
              <line key={v} x1="0" x2="100" y1={py(v)} y2={py(v)} stroke={grid} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
            ))}
            <line x1="0" x2="100" y1="100" y2="100" stroke={grid} vectorEffect="non-scaling-stroke" />
            {data.length > 1 && (
              <polygon points={`${px(data[0].date)},100 ${actualLine} ${px(last.date)},100`} fill={`url(#${gradientId})`} />
            )}
            {markerPoint && (
              <line
                x1={px(markerPoint.date)}
                x2={px(markerPoint.date)}
                y1={py(markerPoint.netWorth)}
                y2="100"
                stroke={soft}
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {data.length > 1 && (
              <polyline points={actualLine} fill="none" stroke={ink} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            )}
            {forecastLine && (
              <polyline points={forecastLine} fill="none" stroke={soft} strokeWidth="2" strokeDasharray="5 5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            )}
            {hovered && (
              <line x1={px(hovered.date)} x2={px(hovered.date)} y1="0" y2="100" stroke={soft} strokeOpacity="0.6" vectorEffect="non-scaling-stroke" />
            )}
          </svg>

          {markerPoint && marker && (
            <>
              <span
                aria-hidden
                className={cn("absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2", onHero ? "border-clear-hero-ink bg-clear-hero" : "border-clear-ink bg-clear-card")}
                style={{ left: `${px(markerPoint.date)}%`, top: `${py(markerPoint.netWorth)}%` }}
              />
              <span
                aria-hidden
                className={cn("absolute -translate-x-[calc(100%+8px)] -translate-y-[calc(100%+6px)] whitespace-nowrap text-xs", textMuted)}
                style={{ left: `${px(markerPoint.date)}%`, top: `${py(markerPoint.netWorth)}%` }}
              >
                <MoneyText>{marker.label}</MoneyText>
              </span>
            </>
          )}

          <span
            aria-hidden
            className={cn("absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-clear-ember", ring)}
            style={{ left: `${px(last.date)}%`, top: `${py(last.netWorth)}%` }}
          />
          {endLabel && (
            <span
              aria-hidden
              className={cn("absolute -translate-x-full -translate-y-[calc(100%+12px)] whitespace-nowrap text-xs font-bold", textStrong)}
              style={{ left: `${px(last.date)}%`, top: `${py(last.netWorth)}%` }}
            >
              <MoneyText>{endLabel}</MoneyText>
            </span>
          )}

          {hovered && (
            <>
              <span
                aria-hidden
                className={cn("absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full", onHero ? "bg-clear-hero-ink" : "bg-clear-ink")}
                style={{ left: `${px(hovered.date)}%`, top: `${py(hovered.netWorth)}%` }}
              />
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute top-0 z-10 flex flex-col gap-0.5 whitespace-nowrap rounded-clear-row bg-clear-card px-3 py-2 text-clear-ink shadow-clear-dialog",
                  alignAt(px(hovered.date)),
                )}
                style={{ left: `${px(hovered.date)}%` }}
              >
                <span className="text-xs text-clear-muted">
                  {fullFmt.format(asDate(hovered.date))}
                  {hovered.forecast && ` · ${t("forecastPoint")}`}
                </span>
                <Amount value={hovered.netWorth} className="text-[15px]" />
              </span>
            </>
          )}

          <div className="absolute inset-0 touch-pan-y" onPointerMove={onPointerMove} onPointerLeave={() => setHover(null)} />
        </div>

        <div aria-hidden className={cn("relative w-12 shrink-0 text-xs", textMuted)}>
          {ticks.map((v) => (
            <span key={v} className="money absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${py(v)}%` }}>
              {tickLabel(v)}
            </span>
          ))}
        </div>
      </div>

      <div aria-hidden className="relative mr-12 h-4 text-xs">
        {xTicks.map((tick) => (
          <span
            key={tick.key}
            className={cn("absolute top-0 whitespace-nowrap", alignAt(tick.x), tick.current ? cn("font-bold", textStrong) : textMuted)}
            style={{ left: `${tick.x}%` }}
          >
            <MoneyText>{tick.label}</MoneyText>
          </span>
        ))}
      </div>
    </div>
  );
}

const RANGES = [30, 90, 180] as const;
type Range = (typeof RANGES)[number];

/**
 * The Net worth hero: today's figure, how it moved against 30 days ago, and the
 * recorded history with a 30 / 90 / 180-day range switch. `history` already ends with
 * today's live figure, so the line ends exactly on the number above it.
 */
export function NetWorthHero({ netWorth, history, today }: { netWorth: number; history: TrendPoint[]; today: string }) {
  const t = useTranslations("insights.netWorth");
  const locale = useLocale();
  const [range, setRange] = useState<Range>(180);

  const hasHistory = history.length >= 2;
  const todayT = time(today);
  const spanDays = hasHistory ? (todayT - time(history[0].date)) / DAY : 0;
  const showRange = spanDays > 30;

  const inRange = history.filter((p) => time(p.date) >= todayT - range * DAY);
  const visible = inRange.length >= 2 ? inRange : history.slice(-2);

  // The point the chip compares with: the last one at least 30 days old, else the oldest.
  const monthAgo = [...history].reverse().find((p) => time(p.date) <= todayT - 30 * DAY);
  const ref = monthAgo ?? (hasHistory ? history[0] : undefined);
  const refDays = ref ? Math.round((todayT - time(ref.date)) / DAY) : 0;
  const refDelta = ref ? netWorth - ref.netWorth : 0;
  const signed = (v: number) => `${v >= 0 ? "+" : "−"}${formatEurWhole(Math.abs(v))}`;

  const first = visible[0];
  const sinceDelta = first ? netWorth - first.netWorth : 0;
  const sinceDate = first ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(new Date(`${first.date}T12:00:00`)) : "";
  const sinceKey = Math.round(sinceDelta) > 0 ? "sinceUp" : Math.round(sinceDelta) < 0 ? "sinceDown" : "sinceSame";

  const marker =
    monthAgo && range > 30 && visible.some((p) => p.date === monthAgo.date)
      ? { date: monthAgo.date, label: t("daysAgoAt", { count: refDays, amount: formatEurWhole(monthAgo.netWorth) }) }
      : undefined;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="networth-hero-title" className="m-0 text-[17px] font-bold">{t("title")}</h2>
        {showRange && (
          <div
            role="radiogroup"
            aria-label={t("rangeLabel")}
            data-tip-anchor="insightsNetWorthRange"
            className="inline-flex gap-1 rounded-full bg-clear-hero-ink/10 p-1"
          >
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={r === range}
                onClick={() => setRange(r)}
                className={cn(
                  "h-9 cursor-pointer rounded-full px-4 text-[13px] outline-none transition-colors focus-visible:ring-3 focus-visible:ring-clear-ember/50",
                  r === range ? "bg-clear-hero-ink font-extrabold text-clear-hero" : "font-bold text-clear-hero-ink-2 hover:text-clear-hero-ink",
                )}
              >
                {t("rangeDays", { count: r })}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <Amount value={netWorth} className="text-[44px] lg:text-[60px]" />
          {ref && refDays > 0 && (
            <DeltaChip direction={refDelta >= 0 ? "up" : "down"} good={refDelta >= 0} className="mb-1.5">
              <MoneyText>{t("vsDaysAgo", { amount: signed(refDelta), count: refDays })}</MoneyText>
            </DeltaChip>
          )}
        </div>
        {hasHistory && (
          <p className="m-0 text-[15px] text-clear-hero-ink-2">
            <MoneyText>{t(sinceKey, { amount: formatEurWhole(Math.abs(sinceDelta)), date: sinceDate })}</MoneyText>
          </p>
        )}
      </div>

      {hasHistory ? (
        <NetWorthTrendChart
          onHero
          data={visible}
          marker={marker}
          endLabel={t("todayAt", { amount: formatEurWhole(netWorth) })}
          ariaLabel={t("heroChartDescription", {
            count: Math.round((todayT - time(visible[0].date)) / DAY),
            start: formatEurWhole(visible[0].netWorth),
            end: formatEurWhole(netWorth),
          })}
          className="h-auto min-h-[200px] flex-1"
        />
      ) : (
        <div className="flex min-h-[200px] flex-1 items-center justify-center rounded-clear-tile border-2 border-dashed border-clear-hero-ink/20 p-6 text-center">
          <p className="m-0 max-w-sm text-[15px] text-clear-hero-ink-2">{t("building")}</p>
        </div>
      )}

      <AnchoredTip id="insightsNetWorthRange" anchor="insightsNetWorthRange" active={showRange} />
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MoneyText, SvgMoneyText } from "@/components/clear/money";
import { compactTick, niceRange } from "@/lib/chart-scale";
import { daysBetween } from "@/lib/net-worth-history";
import { formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ChartBand {
  key: "cash" | "investments" | "things" | "mainDebt" | "otherDebts";
  label: string;
  values: number[];
}

const FILL: Record<ChartBand["key"], string> = {
  cash: "var(--clr-mint)",
  investments: "var(--clr-lilac)",
  things: "var(--clr-butter)",
  mainDebt: "var(--clr-peach)",
  otherDebts: "var(--clr-rose)",
};

const INK: Record<ChartBand["key"], string> = {
  cash: "var(--clr-mint-ink)",
  investments: "var(--clr-lilac-ink)",
  things: "var(--clr-butter-ink)",
  mainDebt: "var(--clr-peach-ink)",
  otherDebts: "var(--clr-rose-ink)",
};

const PAD = { left: 44, right: 8, top: 14, bottom: 26 };

/** Sign first with a real minus. */
function signed(v: number) {
  const r = Math.round(v);
  return `${r < 0 ? "−" : ""}${formatEurWhole(Math.abs(r))}`;
}

/**
 * What you own and owe over the range: assets stacked above zero by kind (cash and
 * savings, investments, things), debts below it (the largest on its own band), the net
 * worth line in between, today's figures at the right edge, and the largest value
 * entered by hand marked as a step. Hover, tap or the arrow keys read out one date.
 */
export function NetWorthChart({
  dates,
  bands,
  net,
  assets,
  debts,
  step,
  description,
}: {
  dates: string[];
  bands: ChartBand[];
  net: number[];
  assets: number[];
  debts: number[];
  /** "Meesman updated by hand", at its date, in its band's colour. */
  step: { date: string; label: string; band: ChartBand["key"] } | null;
  description: string;
}) {
  const t = useTranslations("insights.netWorthTab.chart");
  const locale = useLocale();
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = dates.length;
  const { w: W, h: H } = size;
  const plotW = Math.max(0, W - PAD.left - PAD.right);
  const plotH = Math.max(0, H - PAD.top - PAD.bottom);
  const scale = niceRange(-Math.max(0, ...debts), Math.max(0, ...assets, ...net), 3);
  const y = (v: number) => PAD.top + (1 - (v - scale.lo) / (scale.hi - scale.lo)) * plotH;
  const spanDays = Math.max(1, daysBetween(dates[0], dates[n - 1]));
  const xOfDate = (d: string) => PAD.left + (Math.max(0, daysBetween(dates[0], d)) / spanDays) * plotW;
  const x = (i: number) => xOfDate(dates[i]);

  const band = (key: ChartBand["key"]) => bands.find((b) => b.key === key)?.values ?? dates.map(() => 0);
  const order: ChartBand["key"][] = ["cash", "investments", "things"];
  const below: ChartBand["key"][] = ["mainDebt", "otherDebts"];
  const area = (lower: number[], upper: number[]) => {
    const top = upper.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const bottom = lower.map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).reverse().join(" ");
    return `${top} ${bottom} Z`;
  };
  const shapes: { key: ChartBand["key"]; d: string }[] = [];
  let acc = dates.map(() => 0);
  for (const key of order) {
    const v = band(key);
    if (v.every((x) => x === 0)) continue;
    const next = acc.map((a, i) => a + v[i]);
    shapes.push({ key, d: area(acc, next) });
    acc = next;
  }
  acc = dates.map(() => 0);
  for (const key of below) {
    const v = band(key);
    if (v.every((x) => x === 0)) continue;
    const next = acc.map((a, i) => a - v[i]);
    shapes.push({ key, d: area(acc, next) });
    acc = next;
  }
  const netLine = net.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  // Month names where a month starts; on a one-month range, a few dates instead.
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short" });
  const ticks: { x: number; label: string }[] = [];
  const first = new Date(`${dates[0]}T12:00:00`);
  for (let d = new Date(first.getFullYear(), first.getMonth() + 1, 1, 12); n > 1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    if (iso > dates[n - 1]) break;
    ticks.push({ x: xOfDate(iso), label: monthFmt.format(d) });
  }
  if (ticks.length < 2 && n > 1) {
    ticks.length = 0;
    for (const i of [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3)]) ticks.push({ x: x(i), label: dayFmt.format(new Date(`${dates[i]}T12:00:00`)) });
  }
  const every = Math.max(1, Math.ceil((ticks.length * 44) / Math.max(1, plotW - 50)));
  const shownTicks = ticks.filter((tick, i) => (ticks.length - 1 - i) % every === 0 && tick.x < W - PAD.right - 44);

  const last = n - 1;
  const hovered = hover != null && hover < n ? hover : null;
  const move = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  };
  const readout = (i: number) => [
    { key: "net", label: t("net"), value: signed(net[i]), strong: true },
    { key: "assets", label: t("assets"), value: signed(assets[i]) },
    { key: "debts", label: t("debts"), value: signed(-debts[i]) },
    ...bands.filter((b) => b.values[i] !== 0).map((b) => ({ key: b.key, label: b.label, value: signed(b.key === "mainDebt" || b.key === "otherDebts" ? -b.values[i] : b.values[i]), strong: false, band: b.key })),
  ];
  const stepIdx = step ? dates.findIndex((d) => d >= step.date) : -1;

  return (
    <div ref={boxRef} className="relative min-h-[210px] flex-1">
      {W > 0 && H > 0 && n > 0 && (
        <svg
          width={W}
          height={H}
          role="img"
          aria-label={description}
          tabIndex={0}
          className="absolute inset-0 block touch-pan-y rounded-clear-row outline-none select-none focus-visible:ring-3 focus-visible:ring-clear-ember/50"
          onPointerMove={(e) => move(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => move(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setHover(null);
          }}
          onFocus={() => setHover((h) => h ?? last)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            const next =
              e.key === "ArrowLeft" ? (hovered ?? n) - 1
              : e.key === "ArrowRight" ? (hovered ?? -1) + 1
              : e.key === "Home" ? 0
              : e.key === "End" ? last
              : e.key === "Escape" ? null
              : undefined;
            if (next === undefined) return;
            e.preventDefault();
            setHover(next == null ? null : Math.max(0, Math.min(last, next)));
          }}
        >
          {scale.ticks.map((v) => (
            <g key={v}>
              {v !== 0 && <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--clr-line)" strokeDasharray="3 4" />}
              <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--clr-placeholder)">
                {compactTick(v, locale)}
              </text>
            </g>
          ))}

          {shapes.map((s) => (
            <path key={s.key} d={s.d} fill={FILL[s.key]} />
          ))}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--clr-ink)" strokeWidth={1.2} />

          {n > 1 && (
            <>
              <polyline points={netLine} fill="none" stroke="var(--clr-card)" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
              <polyline points={netLine} fill="none" stroke="var(--clr-ink)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
            </>
          )}
          <line x1={x(last)} x2={x(last)} y1={PAD.top - 4} y2={PAD.top + plotH} stroke="var(--clr-ink)" strokeDasharray="2 3" />
          <circle cx={x(last)} cy={y(net[last])} r={5} fill="var(--clr-ink)" stroke="var(--clr-card)" strokeWidth={2} />

          {/* Today's figures beside the right edge. */}
          {hovered == null && (
            <g fontSize="12" fontWeight={600}>
              <text x={x(last) - 8} y={y(net[last]) - 8} textAnchor="end" fill="var(--clr-ink)"><SvgMoneyText>{signed(net[last])}</SvgMoneyText></text>
              {assets[last] > 0 && Math.abs(y(assets[last]) - y(net[last])) > 22 && (
                <text x={x(last) - 8} y={Math.max(12, y(assets[last]) - 6)} textAnchor="end" fill="var(--clr-ink-2)"><SvgMoneyText>{signed(assets[last])}</SvgMoneyText></text>
              )}
              {debts[last] > 0 && (
                <text x={x(last) - 8} y={Math.min(PAD.top + plotH - 4, y(-debts[last]) - 6)} textAnchor="end" fill="var(--clr-peach-ink)"><SvgMoneyText>{signed(-debts[last])}</SvgMoneyText></text>
              )}
            </g>
          )}

          {step && stepIdx > 0 && stepIdx < last && hovered == null && (
            <text
              x={Math.min(Math.max(x(stepIdx), PAD.left + 70), W - PAD.right - 140)}
              y={Math.max(12, y(assets[stepIdx]) + 16)}
              textAnchor="middle"
              fontSize="12"
              fontWeight={600}
              fill={INK[step.band]}
            >
              {step.label}
            </text>
          )}

          {hovered != null && (
            <g pointerEvents="none">
              <line x1={x(hovered)} x2={x(hovered)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--clr-ink)" strokeOpacity={0.35} />
              <circle cx={x(hovered)} cy={y(net[hovered])} r={5} fill="var(--clr-ink)" stroke="var(--clr-card)" strokeWidth={2} />
            </g>
          )}

          {shownTicks.map((tick) => (
            <text key={`${tick.x}-${tick.label}`} x={tick.x} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--clr-placeholder)">
              {tick.label}
            </text>
          ))}
          <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize="12" fontWeight={600} fill="var(--clr-ink)">
            {t("today")}
          </text>
        </svg>
      )}

      {hovered != null && W > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 flex w-[208px] flex-col gap-1 rounded-clear-tile border border-clear-line bg-clear-card px-3.5 py-2.5 text-[13px] shadow-clear-dialog"
          style={{ top: 0, left: x(hovered) > W - 236 ? Math.max(0, x(hovered) - 220) : x(hovered) + 12 }}
        >
          <span className="text-xs font-semibold text-clear-muted">{hovered === last ? t("today") : dayFmt.format(new Date(`${dates[hovered]}T12:00:00`))}</span>
          {readout(hovered).map((p) => (
            <span key={p.key} className="flex min-w-0 items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-clear-ink-2">
                {"band" in p && p.band && <span className="size-2 shrink-0 rounded-[3px]" style={{ background: FILL[p.band] }} />}
                <span className="truncate">{p.label}</span>
              </span>
              <span className={cn("shrink-0 tabular-nums", p.strong ? "font-bold text-clear-ink" : "font-semibold")}>
                <MoneyText>{p.value}</MoneyText>
              </span>
            </span>
          ))}
        </div>
      )}
      <p aria-live="polite" className="sr-only">
        {hovered != null ? readout(hovered).map((p) => `${p.label} ${p.value}`).join(", ") : ""}
      </p>
    </div>
  );
}

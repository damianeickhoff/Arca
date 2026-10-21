"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconChevronDown } from "@tabler/icons-react";
import { ResponsivePopover } from "@/components/clear/responsive-popover";
import { MoneyText, SvgMoneyText } from "@/components/clear/money";
import { compactTick, niceRange } from "@/lib/chart-scale";
import { formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface SpendingFocus {
  key: string;
  label: string;
  /** "All spending": needs and wants stacked. */
  needs?: number[];
  wants?: number[];
  /** One group or category: a single bar per month. */
  values?: number[];
}

export interface ChartMonth {
  key: string;
  /** "May". */
  short: string;
  /** "May 2026". */
  long: string;
}

/** Sign first with a real minus: "+€621", "−€9". */
function signed(v: number) {
  const r = Math.round(v);
  return `${r < 0 ? "−" : r > 0 ? "+" : ""}${formatEurWhole(Math.abs(r))}`;
}

const PAD = { left: 36, right: 8, top: 28, bottom: 46 };
const VISIBLE_CHIPS = 7;

/**
 * Spending per budget month: needs (ink) and wants (grey) stacked, the running month
 * hatched, income as a green line (its running month dashed to what is still due), the
 * average spend dashed, and what was left over under each month. The chips swap the
 * bars for one group or category. Hover, tap or the arrow keys show a month's figures.
 * Drawn in real pixels (measured), so the 12px labels stay 12px on a phone.
 */
export function SpendingChart({
  months,
  runningIndex,
  focuses,
  income,
  expectedIncome,
  dueLabel,
  incomeNote,
  avgSpend,
  description,
}: {
  months: ChartMonth[];
  runningIndex: number | null;
  /** The first is "All spending" (needs + wants); the rest one series each. */
  focuses: SpendingFocus[];
  income: number[];
  /** The running month's income including what is still due, or null. */
  expectedIncome: number | null;
  /** "Salary due 30 Oct", already translated. */
  dueLabel: string | null;
  /** The month whose income stood out and what made it ("Holiday pay"). */
  incomeNote: { index: number; label: string } | null;
  /** Average spend per finished month (for "All spending"). */
  avgSpend: number;
  /** Already translated description for screen readers. */
  description: string;
}) {
  const t = useTranslations("insights.trendsTab.chart");
  const locale = useLocale();
  const patternId = useId().replace(/:/g, "");
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [focusKey, setFocusKey] = useState(focuses[0]?.key ?? "all");
  const [hover, setHover] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const focus = focuses.find((f) => f.key === focusKey) ?? focuses[0];
  const stacked = !!focus?.needs;
  const n = months.length;
  const finished = months.map((_, i) => i).filter((i) => i !== runningIndex);
  const totals = months.map((_, i) => (stacked ? (focus.needs![i] ?? 0) + (focus.wants![i] ?? 0) : (focus?.values?.[i] ?? 0)));
  const avg = stacked
    ? avgSpend
    : finished.length > 0
      ? finished.reduce((s, i) => s + totals[i], 0) / finished.length
      : totals.reduce((s, v) => s + v, 0) / Math.max(1, n);
  const showIncome = stacked;
  const leftOver = months.map((_, i) => (income[i] ?? 0) - totals[i]);

  const width = size.w;
  const H = size.h;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const max = Math.max(...totals, avg, ...(showIncome ? [...income, expectedIncome ?? 0] : []), 1);
  const scale = niceRange(0, max, 3);
  const y = (v: number) => PAD.top + (1 - (v - scale.lo) / (scale.hi - scale.lo)) * plotH;
  const col = n > 0 ? plotW / n : 0;
  const cx = (i: number) => PAD.left + (i + 0.5) * col;
  const barW = Math.max(6, Math.min(28, col * 0.46));
  const base = y(0);

  const incomeAt = (i: number) => (i === runningIndex && expectedIncome != null ? expectedIncome : (income[i] ?? 0));
  const solidIdx = months.map((_, i) => i).filter((i) => i !== runningIndex);
  const solid = solidIdx.map((i) => `${cx(i).toFixed(1)},${y(income[i] ?? 0).toFixed(1)}`).join(" ");
  const lastSolid = solidIdx.at(-1);

  const step = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 56))));
  const showLabel = (i: number) => (n - 1 - i) % step === 0;
  const roomForRow = col >= 52;

  const move = (clientX: number, rect: DOMRect) => {
    const i = Math.floor((clientX - rect.left - PAD.left) / col);
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  // The month's figures, for the tooltip and the live region.
  const readout = (i: number) => {
    const parts: { key: string; label: string; value: string; tone?: string }[] = [];
    if (stacked) {
      parts.push({ key: "needs", label: t("needs"), value: formatEurWhole(focus.needs![i] ?? 0) });
      parts.push({ key: "wants", label: t("wants"), value: formatEurWhole(focus.wants![i] ?? 0) });
      parts.push({ key: "income", label: t("income"), value: formatEurWhole(income[i] ?? 0), tone: "text-clear-positive" });
      if (i === runningIndex && expectedIncome != null && expectedIncome > (income[i] ?? 0)) {
        parts.push({ key: "due", label: t("stillDue"), value: formatEurWhole(expectedIncome - (income[i] ?? 0)), tone: "text-clear-positive" });
      }
      parts.push({ key: "left", label: i === runningIndex ? t("leftSoFar") : t("leftOver"), value: signed(leftOver[i]) });
    } else {
      parts.push({ key: "value", label: focus.label, value: formatEurWhole(totals[i]) });
      parts.push({ key: "avg", label: t("avg"), value: formatEurWhole(avg) });
    }
    return parts;
  };

  const hovered = hover != null && hover < n ? hover : null;
  const chips = focuses.slice(0, VISIBLE_CHIPS);
  const more = focuses.slice(VISIBLE_CHIPS);
  const chipClass = (on: boolean) =>
    cn(
      "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 font-clear text-xs font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50",
      on ? "bg-clear-primary text-clear-primary-ink" : "bg-clear-stone text-clear-stone-ink hover:bg-clear-line",
    );

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div role="radiogroup" aria-label={t("show")} className="flex flex-wrap gap-1.5">
        {chips.map((f) => (
          <button key={f.key} type="button" role="radio" aria-checked={f.key === focus?.key} onClick={() => setFocusKey(f.key)} className={chipClass(f.key === focus?.key)}>
            {f.label}
          </button>
        ))}
        {more.length > 0 && (
          <ResponsivePopover
            open={moreOpen}
            onOpenChange={setMoreOpen}
            title={t("moreTitle")}
            trigger={
              <button type="button" className={chipClass(more.some((f) => f.key === focus?.key))}>
                {more.find((f) => f.key === focus?.key)?.label ?? t("more", { count: more.length })}
                <IconChevronDown aria-hidden className="size-3.5" />
              </button>
            }
          >
            <div className="flex flex-col">
              {more.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setFocusKey(f.key);
                    setMoreOpen(false);
                  }}
                  className={cn("flex h-11 w-full cursor-pointer items-center rounded-clear-row px-3 text-left text-sm font-semibold hover:bg-clear-tile", f.key === focus?.key && "bg-clear-tile")}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </ResponsivePopover>
        )}
      </div>

      <div ref={boxRef} className="relative min-h-[236px] flex-1">
        {width > 0 && H > 0 && n > 0 && (
          <svg
            width={width}
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
            onFocus={() => setHover((h) => h ?? n - 1)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              const next =
                e.key === "ArrowLeft" ? (hovered ?? n) - 1
                : e.key === "ArrowRight" ? (hovered ?? -1) + 1
                : e.key === "Home" ? 0
                : e.key === "End" ? n - 1
                : e.key === "Escape" ? null
                : undefined;
              if (next === undefined) return;
              e.preventDefault();
              setHover(next == null ? null : Math.max(0, Math.min(n - 1, next)));
            }}
          >
            <defs>
              <pattern id={`${patternId}-ink`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--clr-card)" />
                <rect width="3" height="6" fill="var(--clr-ink)" />
              </pattern>
              <pattern id={`${patternId}-grey`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--clr-card)" />
                <rect width="3" height="6" fill="var(--clr-placeholder)" />
              </pattern>
            </defs>

            {hovered != null && <rect x={PAD.left + hovered * col + 2} y={PAD.top - 8} width={col - 4} height={plotH + 8} rx={12} fill="var(--clr-tile)" />}

            {scale.ticks.map((v, i) => (
              <g key={v}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--clr-line)" strokeDasharray={i === 0 ? undefined : "3 4"} />
                <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--clr-placeholder)">
                  {compactTick(v, locale)}
                </text>
              </g>
            ))}

            {months.map((m, i) => {
              const running = i === runningIndex;
              const x = cx(i) - barW / 2;
              if (stacked) {
                const needs = focus.needs![i] ?? 0;
                const wants = focus.wants![i] ?? 0;
                const hN = base - y(needs);
                const hW = base - y(needs + wants) - (needs > 0 && wants > 0 ? 2 : 0);
                return (
                  <g key={m.key}>
                    {needs > 0 && <rect x={x} y={y(needs)} width={barW} height={Math.max(1, hN)} rx={Math.min(5, barW / 4)} fill={running ? `url(#${patternId}-ink)` : "var(--clr-ink)"} />}
                    {wants > 0 && hW > 0 && <rect x={x} y={y(needs + wants)} width={barW} height={hW} rx={Math.min(5, barW / 4)} fill={running ? `url(#${patternId}-grey)` : "var(--clr-placeholder)"} />}
                  </g>
                );
              }
              const v = totals[i];
              return v > 0 ? <rect key={m.key} x={x} y={y(v)} width={barW} height={Math.max(1, base - y(v))} rx={Math.min(5, barW / 4)} fill={running ? `url(#${patternId}-ink)` : "var(--clr-ink)"} /> : null;
            })}

            {avg > 0 && <line x1={PAD.left} x2={width - PAD.right} y1={y(avg)} y2={y(avg)} stroke="var(--clr-placeholder)" strokeWidth={1.5} strokeDasharray="5 4" />}

            {showIncome && (
              <g>
                {solidIdx.length > 1 && <polyline points={solid} fill="none" stroke="var(--clr-positive)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />}
                {runningIndex != null && lastSolid != null && (
                  <line x1={cx(lastSolid)} y1={y(income[lastSolid] ?? 0)} x2={cx(runningIndex)} y2={y(incomeAt(runningIndex))} stroke="var(--clr-positive)" strokeWidth={2} strokeDasharray="4 4" />
                )}
                {solidIdx.map((i) => (
                  <circle key={i} cx={cx(i)} cy={y(income[i] ?? 0)} r={hovered === i ? 6 : 5} fill="var(--clr-positive)" stroke="var(--clr-card)" strokeWidth={2} />
                ))}
                {runningIndex != null && <circle cx={cx(runningIndex)} cy={y(incomeAt(runningIndex))} r={4.5} fill="var(--clr-card)" stroke="var(--clr-positive)" strokeWidth={2} />}
                {incomeNote && incomeNote.index !== runningIndex && (
                  <text x={Math.min(Math.max(cx(incomeNote.index), PAD.left + 30), width - PAD.right - 30)} y={y(income[incomeNote.index] ?? 0) - 11} textAnchor="middle" fontSize="12" fontWeight={600} fill="var(--clr-positive)">
                    {incomeNote.label}
                  </text>
                )}
                {runningIndex != null && dueLabel && (
                  <text x={width - PAD.right} y={Math.max(12, y(incomeAt(runningIndex)) - 11)} textAnchor="end" fontSize="12" fontWeight={600} fill="var(--clr-positive)">
                    {dueLabel}
                  </text>
                )}
              </g>
            )}

            {runningIndex != null && totals[runningIndex] > 0 && (
              <text x={cx(runningIndex)} y={y(totals[runningIndex]) - 6} textAnchor="middle" fontSize="12" fontWeight={600} fill="var(--clr-ink-2)">
                <SvgMoneyText>{t("soFar", { amount: formatEurWhole(totals[runningIndex]) })}</SvgMoneyText>
              </text>
            )}

            {months.map((m, i) =>
              showLabel(i) ? (
                <text
                  key={m.key}
                  x={cx(i)}
                  y={H - 26}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight={i === runningIndex || i === hovered ? 600 : 500}
                  fill={i === runningIndex || i === hovered ? "var(--clr-ink)" : "var(--clr-placeholder)"}
                >
                  {i === runningIndex && col >= 64 ? t("monthSoFar", { month: m.short }) : m.short}
                </text>
              ) : null,
            )}

            {roomForRow &&
              months.map((m, i) => {
                const running = i === runningIndex;
                const text = stacked ? (running ? t("running") : signed(leftOver[i])) : formatEurWhole(totals[i]);
                const fill = !stacked || running ? "var(--clr-placeholder)" : leftOver[i] >= 0 ? "var(--clr-positive)" : "var(--clr-negative)";
                return (
                  <text key={m.key} x={cx(i)} y={H - 6} textAnchor="middle" fontSize="12" fontWeight={600} fill={fill} className="tabular-nums">
                    <SvgMoneyText>{text}</SvgMoneyText>
                  </text>
                );
              })}
          </svg>
        )}

        {hovered != null && width > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 flex w-[196px] flex-col gap-1 rounded-clear-tile border border-clear-line bg-clear-card px-3.5 py-2.5 text-[13px] shadow-clear-dialog"
            style={{ top: 0, left: cx(hovered) > width - 220 ? Math.max(0, cx(hovered) - col / 2 - 204) : cx(hovered) + col / 2 + 4 }}
          >
            <span className="text-xs font-semibold text-clear-muted first-letter:uppercase">
              {hovered === runningIndex ? t("monthSoFar", { month: months[hovered].long }) : months[hovered].long}
            </span>
            {readout(hovered).map((p) => (
              <span key={p.key} className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate font-medium text-clear-ink-2">{p.label}</span>
                <span className={cn("shrink-0 font-bold tabular-nums", p.tone)}>
                  <MoneyText>{p.value}</MoneyText>
                </span>
              </span>
            ))}
          </div>
        )}
        <p aria-live="polite" className="sr-only">
          {hovered != null ? `${months[hovered].long}: ${readout(hovered).map((p) => `${p.label} ${p.value}`).join(", ")}` : ""}
        </p>
      </div>
    </div>
  );
}

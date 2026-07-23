"use client";

import { useState } from "react";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CategoryDetail } from "@/lib/category-detail";

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const NEUTRAL_BAR = "color-mix(in srgb, var(--foreground) 18%, transparent)";

// Cards are a fixed w-40 square in the normal (scrollable) case. When there are only
// two of them, they instead split the full row width — still square, via aspect-square
// on a flex-1 basis instead of a fixed width.
function cardClass(wide: boolean) {
  return cn("rounded-2xl bg-[var(--dialog-content-background)] p-4 flex flex-col aspect-square", wide ? "flex-1" : "shrink-0 w-40 snap-start");
}

/** Full-circle ring — same shape as the dashboard's own CategoryProgressRing
 * (src/components/category-spending-row.tsx), just bigger and always drawn in the
 * category's own color rather than a severity color. `periodElapsedPct` (0-100, how
 * far into the selected period "today" is) places a small white "you are here" dot
 * along the ring, same marker as the dashboard cards use. */
function BudgetRing({ pct, color, periodElapsedPct, size = 104 }: { pct: number; color: string | null; periodElapsedPct: number; size?: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const ring = color ?? "var(--success)";
  const markerAngle = (periodElapsedPct / 100) * 2 * Math.PI;
  const markerX = 50 + 42 * Math.cos(markerAngle);
  const markerY = 50 + 42 * Math.sin(markerAngle);
  return (
    <svg viewBox="0 0 100 100" style={{ width: size, height: size }} className="-rotate-90">
      <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="8" />
      {clamped > 0 && (
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={ring}
          strokeWidth="8"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${clamped} 100`}
          style={{ transition: "stroke-dasharray 500ms ease" }}
        />
      )}
      <circle cx={markerX} cy={markerY} r="4" fill="white" />
    </svg>
  );
}

function BudgetCard({ budget, spent, color, periodElapsedPct, wide }: { budget: number; spent: number; color: string | null; periodElapsedPct: number; wide: boolean }) {
  const pct = budget > 0 ? Math.max(0, Math.min(100, (spent / budget) * 100)) : 0;
  return (
    <div className={cn(cardClass(wide), "items-center justify-center relative")}>
      <div className="relative flex items-center justify-center">
        <BudgetRing pct={pct} color={color} periodElapsedPct={periodElapsedPct} size={92} />
        <p className="absolute text-base font-semibold tabular-nums text-foreground px-1 text-center">{formatEur(spent)}</p>
      </div>
      <p className="mt-3 text-xs text-foreground/50 tabular-nums text-center">of {formatEur(budget)} limit</p>
    </div>
  );
}

/** Inline dot pair (not absolutely positioned, so it sits on the same line as
 * whatever header text it's paired with). Each dot's own visual mark is tiny, but
 * the button itself gets generous padding so the whole area around it is tappable —
 * not just the few-pixel dot. */
function DotToggle({ active, onChange }: { active: 0 | 1; onChange: (v: 0 | 1) => void }) {
  return (
    <button
      type="button"
      aria-label="Switch forecast view"
      onClick={(e) => {
        e.stopPropagation();
        onChange(active === 0 ? 1 : 0);
      }}
      className="flex items-center gap-0.5 -mr-1.5 p-1"
    >
      {[0, 1].map((i) => (
        <span
          key={i}
          className={cn(
            "rounded-full transition-all",
            active === i
              ? "w-1.5 h-1.5 bg-foreground/50"
              : "w-1.5 h-1.5 bg-foreground/20"
          )}
        />
      ))}
    </button>
  );
}

function ForecastCard({ forecast, budget, spent, daysLeft, daysElapsed, wide }: {
  forecast: number;
  budget: number | null;
  spent: number;
  daysLeft: number;
  daysElapsed: number;
  wide: boolean;
}) {
  const [view, setView] = useState<0 | 1>(0);
  const pct = budget && budget > 0 ? Math.round((forecast / budget) * 100) : null;
  const over = budget != null && forecast > budget;
  const perDayAvailable = budget != null ? Math.max(0, (budget - spent) / Math.max(1, daysLeft)) : null;
  const budgetDifference = budget != null ? Math.abs(budget - spent) : null;
  const currentPace = spent / Math.max(1, daysElapsed);

  return (
    <div className={cardClass(wide)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-md font-medium text-foreground/60">Forecast</p>
        {budget != null && (
          <DotToggle active={view} onChange={setView} />
        )}
      </div>
      <p className="mt-1 flex items-baseline gap-2 flex-wrap">
        <span className="text-xl font-semibold text-foreground tabular-nums">{formatEur(forecast)}</span>
        {pct != null && <span className={cn("text-md font-medium tabular-nums", over ? "text-[var(--color-expense)]" : "text-foreground/50")}>{pct}%</span>}
      </p>
      <div className="mt-auto text-sm font-medium">
        {view === 0
          ? budgetDifference != null
            ? (
                <span className="text-foreground/50">
                  <span className={over ? "text-[var(--color-expense)]" : "text-[var(--color-success)]"}>
                    {formatEur(budgetDifference)}
                  </span>{" "}
                  {over ? "over budget" : "under budget"}
                </span>
              )
            : (
                <span className="text-foreground/50">
                  Current pace <span className="font-semibold text-foreground">{formatEur(currentPace)}/day</span>
                </span>
              )
          : budget != null && perDayAvailable != null
            ? <span className="text-foreground/50">up to <span className="font-semibold text-foreground">{formatEur(perDayAvailable)}</span>/day available</span>
            : <span className="text-foreground/50">Current pace <span className="font-semibold text-foreground">{formatEur(currentPace)}</span>/day</span>}
      </div>
    </div>
  );
}

function StatCard({ label, wide, children }: { label: string; wide: boolean; children: React.ReactNode }) {
  return (
    <div className={cardClass(wide)}>
      <p className="text-lg font-medium text-foreground/60">{label}</p>
      {children}
    </div>
  );
}

/** Bars stay neutral (no category color) — only the dashed average line is colored,
 * so the chart reads the same way regardless of category. */
function AvgSpentMiniChart({ buckets, color }: { buckets: { key: string; amount: number }[]; color: string | null }) {
  const max = Math.max(1, ...buckets.map((b) => b.amount));
  const avg = buckets.length > 0 ? buckets.reduce((s, b) => s + b.amount, 0) / buckets.length : 0;
  const avgPct = (avg / max) * 100;
  const lineColor = color ?? "var(--success)";
  return (
    <div className="relative mt-auto flex items-end justify-between gap-1 h-11">
      <div className="absolute left-0 right-0 border-t border-dashed" style={{ bottom: `${avgPct}%`, borderColor: lineColor, opacity: 0.7 }} />
      {buckets.map((b, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm"
          style={{ height: `${Math.max(6, (b.amount / max) * 100)}%`, background: NEUTRAL_BAR }}
        />
      ))}
    </div>
  );
}

function PopularDayMiniChart({ amounts, popular }: { amounts: number[]; popular: number }) {
  const max = Math.max(1, ...amounts);
  return (
    <div className="mt-auto flex items-end justify-between gap-1 h-11">
      {amounts.map((a, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm"
          style={{ height: `${Math.max(6, (a / max) * 100)}%`, background: i === popular ? "var(--foreground)" : NEUTRAL_BAR }}
        />
      ))}
    </div>
  );
}

export function CategoryInsightCards({ detail, color, periodElapsedPct, periodLabel }: { detail: CategoryDetail; color: string | null; periodElapsedPct: number; periodLabel: string }) {
  const hasBudget = detail.budget != null && detail.budget > 0;
  const hasTx = detail.transactions.length > 0;
  const enoughTx = detail.transactions.length >= 4;

  if (!hasBudget && !hasTx) return null;

  const toDate = new Date(`${detail.to}T00:00:00`);
  const today = new Date();
  const daysLeft = Math.max(0, Math.round((toDate.getTime() - today.getTime()) / 86_400_000));
  const fromDate = new Date(`${detail.from}T00:00:00`);
  const daysElapsed = Math.max(1, Math.round((today.getTime() - fromDate.getTime()) / 86_400_000) + 1);

  const cardCount = (hasBudget ? 1 : 0) + (hasTx && detail.forecast != null ? 1 : 0) + (enoughTx ? 3 : hasTx ? 1 : 0);
  const wide = cardCount === 2;

  return (
    <div
      className={cn(
        "flex gap-3 px-4 pb-1",
        wide ? "" : "overflow-x-auto snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      )}
    >
      {hasBudget && <BudgetCard budget={detail.budget!} spent={detail.spent} color={color} periodElapsedPct={periodElapsedPct} wide={wide} />}

      {hasTx && detail.forecast != null && (
        <ForecastCard 
          forecast={detail.forecast} 
          budget={detail.budget} 
          spent={detail.spent} 
          daysLeft={daysLeft}
          daysElapsed={daysElapsed}
          wide={wide} 
        />
      )}

      {enoughTx ? (
        <>
          <StatCard label="Avg spent" wide={wide}>
            <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{formatEur(detail.avgPerWeek ?? 0)}</p>
            {detail.avgChart && <AvgSpentMiniChart buckets={detail.avgChart} color={color} />}
            <p className="mt-1 text-center text-[10px] text-foreground/40 truncate">{periodLabel}</p>
          </StatCard>

          <StatCard label="Popular day" wide={wide}>
            <p className="mt-1 text-base font-semibold text-foreground truncate">
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][detail.popularDay!.weekday]}
            </p>
            <PopularDayMiniChart amounts={detail.popularDay!.amounts} popular={detail.popularDay!.weekday} />
            <div className="flex justify-between mt-1">
              {WEEKDAY_LETTERS.map((l, i) => (
                <span key={i} className={cn("flex-1 text-center text-[10px]", i === detail.popularDay!.weekday ? "text-foreground font-medium" : "text-foreground/40")}>{l}</span>
              ))}
            </div>
          </StatCard>

          <StatCard label="Biggest spent" wide={wide}>
            <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{formatEur(detail.biggestSpent ?? 0)}</p>
          </StatCard>
        </>
      ) : hasTx ? (
        <StatCard label="Insights" wide={wide}>
          <p className="mt-auto mt-2 text-sm text-foreground/60 leading-snug">Add more transactions to unlock personalised insights.</p>
        </StatCard>
      ) : null}
    </div>
  );
}

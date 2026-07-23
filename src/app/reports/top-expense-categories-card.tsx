"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, Sector, ResponsiveContainer, Tooltip } from "recharts";
import { formatEur } from "@/lib/format";
import { NeedsWantsFilterControl, type NeedsWantsFilter } from "@/components/dashboard-charts";
import { normalizeBudgetType } from "@/lib/format";
import { SplitEur } from "@/components/split-eur";

// The app's own chart palette (defined in globals.css) — used positionally instead of each
// category's own color, since two categories can share the same color and would otherwise
// render as indistinguishable slices.
const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

interface PieSliceProps {
  cx?: number;
  cy?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  fill?: string;
}

/**
 * A fixed cornerRadius breaks down on thin slices: rounding both ends of an arc needs at least
 * ~2x the radius worth of arc length, and a slice under a few percent of the pie simply doesn't
 * have that much arc length at this radius. Scale the corner radius down per-slice based on its
 * actual angular span so it never exceeds what the slice can physically fit.
 */
function ScaledCornerSlice(maxRadius: number) {
  return function Slice(props: PieSliceProps) {
    const { outerRadius = 0, startAngle = 0, endAngle = 0 } = props;
    const angle = Math.abs(endAngle - startAngle);
    const arcLength = outerRadius * (angle * Math.PI) / 180;
    const safeRadius = Math.min(maxRadius, arcLength / 3);
    return <Sector {...props} cornerRadius={safeRadius} />;
  };
}

const roundedSliceShape = ScaledCornerSlice(9);

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { name: string; value: number; color: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const { name, value, color } = payload[0].payload;
  return (
    <div className="rounded-xl bg-card-glass px-3.5 py-2.5 text-xs flex items-center gap-2">
      <span className="size-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-foreground/60">{name}</span>
      <span className="font-bold tabular-nums ml-auto pl-4">{formatEur(value)}</span>
    </div>
  );
}

type Category = { name: string; total: number; budgetType: string | null; color?: string | null };

export function TopExpenseCategoriesCard({
  categories,
  periodLabel,
}: {
  categories: Category[];
  periodLabel: string;
}) {
  const [filter, setFilter] = useState<NeedsWantsFilter>("beide");

  const filtered = categories.filter((c) => filter === "beide" || normalizeBudgetType(c.budgetType) === filter);
  const total = filtered.reduce((sum, c) => sum + c.total, 0);
  const top5 = [...filtered].sort((a, b) => b.total - a.total).slice(0, 5);
  const top5Colors = top5.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
  const top5Total = top5.reduce((sum, c) => sum + c.total, 0);
  const rest = total - top5Total;
  // Same slices as the chips below, in the same order/colors — plus a muted "rest" slice for
  // anything outside the top 5, so the two visuals always agree with each other.
  const donutData = [
    ...top5.map((c, i) => ({ name: c.name, value: c.total, color: top5Colors[i] })),
    ...(rest > 0 ? [{ name: "Overig", value: rest, color: "#cbd5e1" }] : []),
  ];

  return (
    <div className="rounded-2xl bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold pb-1">Expenses per category</h2>
          <p className="text-xs text-foreground/60 truncate">{periodLabel}</p>
        </div>
        <NeedsWantsFilterControl filter={filter} onChange={setFilter} />
      </div>

      {total > 0 && donutData.length > 0 ? (
        <div className="flex items-center gap-3">
          <div className="relative flex justify-center items-center w-1/2 shrink-0 [&_.recharts-tooltip-wrapper]:z-10">
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie
                  data={donutData}
                  innerRadius="65%"
                  outerRadius="85%"
                  startAngle={90}
                  endAngle={-270}
                  strokeWidth={0}
                  paddingAngle={donutData.length > 1 ? 3 : 0}
                  shape={roundedSliceShape}
                  // Recharts' Pie entrance animation gets stuck at startAngle===endAngle (frame
                  // zero, no visible sectors) whenever a custom `shape` is supplied — verified by
                  // logging the actual per-sector props mid-animation. Must stay disabled here.
                  isAnimationActive={true}
                >
                  {donutData.map((d, i) => (
                    <Cell key={`${d.name}-${i}`} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 z-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-xl font-bold tabular-nums leading-tight"><SplitEur formatted={formatEur(total)} /></p>
            </div>
          </div>

          <div className="flex flex-col gap-2 min-w-0 flex-1">
            {top5.map((c, i) => {
              const color = top5Colors[i];
              const pct = total > 0 ? (c.total / total) * 100 : 0;
              return (
                <div key={`${c.name}-${i}`} className="flex items-center gap-2.5 pl-4 min-w-0">
                  <span className="size-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-sm/[1.2] font-medium text-foreground/60 truncate">{c.name}</span>
                  <span className="text-sm/[1.2] font-medium text-foreground/60 tabular-nums shrink-0 ml-auto">{pct.toFixed(1)}%</span>
                </div>
              );
            })}
            {rest > 0 && (
              <div className="flex items-center gap-2.5 pl-4 min-w-0">
                <span className="size-2 rounded-full shrink-0" style={{ background: "#cbd5e1" }} />
                <span className="text-sm/[1.2] font-medium text-foreground/60 truncate">Overig</span>
                <span className="text-sm/[1.2] font-medium text-foreground/60 tabular-nums shrink-0 ml-auto">{(total > 0 ? (rest / total) * 100 : 0).toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No expenses in this period.</p>
      )}
    </div>
  );
}

"use client";

import { ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Text } from "recharts";
import type { XAxisTickContentProps } from "recharts";
import { formatEur } from "@/lib/format";
import type { CategorySpendPoint } from "@/lib/category-detail";

function fmtTick(date: string) {
  return new Date(`${date}T00:00:00`).getDate().toString();
}

/** Cumulative actual spend (solid, filled) continuing as a dashed forecast to the end
 * of the period, with a dashed reference line at the budget amount — same split
 * actual/forecast dataKey trick as WalletBalanceLineChart in dashboard-charts.tsx. */
export function CategorySpendChart({ data, budget, color }: { data: CategorySpendPoint[]; budget: number | null; color: string | null }) {
  const stroke = color ?? "var(--color-expense)";
  const gradId = "categorySpendGrad";

  // Thin the x-axis ticks so labels don't collide on long ranges (a year of daily
  // points would otherwise render 365 overlapping ticks).
  const tickEvery = Math.max(1, Math.ceil(data.length / 7));
  const ticks = data.filter((_, i) => i % tickEvery === 0 || i === data.length - 1).map((d) => d.date);

  const maxVal = Math.max(budget ?? 0, ...data.map((d) => d.actual ?? 0), ...data.map((d) => d.forecast ?? 0), 1);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>

        <XAxis
          dataKey="date"
          ticks={ticks}
          tickFormatter={fmtTick}
          // Custom renderer instead of the plain style-object `tick` — nudges just the
          // first/last date labels a few px inward so they're not flush against the
          // card edges. Only the label glyphs move; the axis scale (and so the
          // plotted area/line, which read off that same scale) is untouched.
          tick={(props: XAxisTickContentProps) => {
            const { x, payload, ...rest } = props;
            const value = String(payload?.value ?? "");
            const isFirst = value === ticks[0];
            const isLast = value === ticks[ticks.length - 1];
            const dx = isFirst ? 5 : isLast ? -5 : 0;
            return (
              <Text {...rest} x={Number(x) + dx} fontSize={11} fill="currentColor" fillOpacity={0.5}>
                {fmtTick(value)}
              </Text>
            );
          }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis hide domain={[0, maxVal]} />

        {budget != null && budget > 0 && data.length > 1 && (
          <ReferenceLine
            // Stops short of the chart's right edge, leaving room for the amount label
            // instead of running underneath it — `segment` (not the plain `y` prop)
            // draws the dashed line only across [start,stop] instead of full-width.
            segment={[
              { x: data[0].date, y: budget },
              { x: data[Math.max(0, Math.ceil(data.length * 0.82) - 1)].date, y: budget },
            ]}
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeDasharray="4 4"
            // A plain `position` label is anchored to the line's bounding box, not its
            // actual pixel y — it ends up floating below the dashed line rather than on
            // it. A render-prop label draws straight at viewBox.y (the line's real pixel
            // position), with dy nudging the text baseline to vertically center on it,
            // positioned just past where the shortened segment ends.
            label={({ viewBox }: { viewBox: { x: number; y: number; width: number } }) => (
              <text x={viewBox.x + viewBox.width + 6} y={viewBox.y} dy={4} textAnchor="start" fontSize={11} fill="currentColor" fillOpacity={0.6}>
                {formatEur(budget)}
              </text>
            )}
          />
        )}

        <Tooltip
          cursor={{ stroke: "currentColor", strokeOpacity: 0.1, strokeWidth: 1 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="rounded-xl bg-card-glass px-3.5 py-2.5 text-xs">
                <p className="text-foreground/60 font-semibold mb-1 uppercase tracking-wider text-[10px]">
                  {new Date(`${String(payload[0].payload.date)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </p>
                <p className="font-bold tabular-nums">{formatEur(Number(payload[0].value ?? payload[1]?.value ?? 0))}</p>
              </div>
            ) : null
          }
        />

        <Area
          type="monotone"
          dataKey="actual"
          stroke={stroke}
          strokeWidth={2.5}
          fill={`url(#${gradId})`}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)", fill: stroke }}
          connectNulls
          isAnimationActive
          animationDuration={750}
          animationEasing="ease-out"
        />

        <Area
          type="monotone"
          dataKey="forecast"
          stroke="currentColor"
          strokeOpacity={0.35}
          strokeWidth={2}
          strokeDasharray="5 5"
          fill="none"
          dot={false}
          connectNulls
          isAnimationActive
          animationDuration={750}
          animationEasing="ease-out"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

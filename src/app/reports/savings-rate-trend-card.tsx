"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { MONTH_NAMES } from "@/lib/format";

interface Point {
  month: string; // YYYY-MM
  savingsRatePct: number | null;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length || payload[0].value == null) return null;
  return (
    <div className="rounded-xl bg-card-glass px-3 py-2 text-xs">
      <p className="text-foreground/60 font-medium mb-1 text-[10px] uppercase tracking-wider">{label}</p>
      <p className="font-bold tabular-nums">{payload[0].value.toFixed(1)}%</p>
    </div>
  );
}

function EndDot(props: { cx?: number; cy?: number; index?: number; dataLength: number; value?: number | null }) {
  const { cx, cy, index, dataLength, value } = props;
  if (index !== dataLength - 1 || cx == null || cy == null || value == null) return null;
  return <circle cx={cx} cy={cy} r={5} fill="var(--color-income)" stroke="white" strokeWidth={2} />;
}

export function SavingsRateTrendCard({ data }: { data: Point[] }) {
  const display = data.map((d) => ({
    name: MONTH_NAMES[parseInt(d.month.slice(5)) - 1]?.slice(0, 3) ?? d.month,
    savingsRatePct: d.savingsRatePct,
  }));

  return (
    <div className="rounded-2xl bg-card p-5">
      <h2 className="text-sm font-semibold mb-1">Savings rate</h2>
      <p className="text-xs text-foreground/60 mb-3">Last 12 months</p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={display} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <defs>
            {/*
              gradientUnits="userSpaceOnUse" (with %, resolved against the SVG viewport) instead of
              the default objectBoundingBox — when net worth hasn't changed between the two most
              recent points, the line is perfectly horizontal, giving it a zero-height bounding box.
              objectBoundingBox gradients degenerate (and silently fail to paint at all) on a
              zero-height/zero-width bbox, which is exactly what made the line disappear here.
            */}
            <linearGradient id="savingPercentageLineGradient" gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--color-income)" stopOpacity={0.1} />
              <stop offset="100%" stopColor="var(--color-income)" stopOpacity={1} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="currentColor" strokeOpacity={0} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "currentColor", opacity: 0.4 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 10, fill: "currentColor", opacity: 0.4 }}
            width={36}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "currentColor", strokeOpacity: 0.1, strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="savingsRatePct"
            stroke="url(#savingPercentageLineGradient)"
            strokeWidth={3}
            connectNulls={false}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number; value?: number | null }) => (
              <EndDot key={props.index} {...props} dataLength={display.length} />
            )}
            activeDot={{ r: 4, strokeWidth: 0, fill: "var(--color-income)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

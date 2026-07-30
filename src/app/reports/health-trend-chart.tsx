"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// Health score over time. Same axis/tooltip treatment as NetWorthTrendChart (the
// Insights portal's other line chart) so the two read as one family; only the
// y-domain differs — a score is always 0–100, so the axis is fixed rather than
// auto-fitted, which would otherwise make a 2-point wobble look like a cliff.

export interface HealthTrendPoint {
  month: string; // YYYY-MM
  score: number;
}

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short" });
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { full: string } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-card-glass px-3 py-2 text-xs">
      <p className="text-foreground/60 font-medium mb-1 text-xs uppercase tracking-wider">
        {payload[0].payload.full ?? label}
      </p>
      <p className="font-bold tabular-nums">{Math.round(payload[0].value)} / 100</p>
    </div>
  );
}

function EndDot(props: { cx?: number; cy?: number; index?: number; dataLength: number }) {
  const { cx, cy, index, dataLength } = props;
  if (index !== dataLength - 1 || cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={5} fill="white" stroke="white" strokeWidth={2} />;
}

const TICK_COUNT = 5;

export function HealthTrendChart({ data }: { data: HealthTrendPoint[] }) {
  const display = data.map((d) => ({
    name: monthLabel(d.month),
    full: new Date(`${d.month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    score: d.score,
  }));
  const tickInterval = Math.max(0, Math.ceil(display.length / TICK_COUNT) - 1);

  return (
    <ResponsiveContainer width="100%" height={190}>
      <LineChart data={display} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
          axisLine={false}
          tickLine={false}
          interval={tickInterval}
          textAnchor="middle"
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 50, 100]}
          tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
          width={28}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "currentColor", strokeOpacity: 0.1, strokeWidth: 1 }} />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#c8cbd0"
          strokeWidth={2}
          isAnimationActive={false}
          dot={(props: { cx?: number; cy?: number; index?: number }) => (
            <EndDot key={props.index} {...props} dataLength={display.length} />
          )}
          activeDot={{ r: 4, strokeWidth: 0, fill: "white" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

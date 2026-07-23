"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatEur } from "@/lib/format";
import { SplitEur } from "@/components/split-eur";

interface Point {
  date: string; // YYYY-MM-DD
  netWorth: number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey?: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  // Both dataKeys can be present at the actual/forecast junction point — prefer
  // "actual" there so the boundary reads as a real value, not a projection.
  const point = payload.find((p) => p.dataKey === "actual") ?? payload[0];
  const isForecast = point.dataKey === "forecast";
  return (
    <div className="rounded-xl bg-card-glass px-3 py-2 text-xs">
      <p className="text-foreground/60 font-medium mb-1 text-xs uppercase tracking-wider">
        {label}{isForecast && " · forecast"}
      </p>
      <p className="font-bold tabular-nums"><SplitEur formatted={formatEur(point.value)} /></p>
    </div>
  );
}

function EndDot(props: { cx?: number; cy?: number; index?: number; dataLength: number }) {
  const { cx, cy, index, dataLength } = props;
  if (index !== dataLength - 1 || cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={5} fill="white" stroke="white" strokeWidth={2} />;
}

// Number of x-axis labels to show, regardless of how many data points there are —
// picked (rather than left to Recharts' "preserveStartEnd", which only guarantees
// the first/last and otherwise skips unevenly) so the visible period labels sit at
// a consistent gap from each other.
const TICK_COUNT = 5;

export function NetWorthTrendChart({ data, forecast }: { data: Point[]; forecast?: Point[] }) {
  const fmtLabel = (date: string) => new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const lastIndex = data.length - 1;
  const display = [
    ...data.map((d, i) => ({
      name: fmtLabel(d.date),
      actual: d.netWorth,
      // The last actual point doubles as the forecast line's starting anchor, so
      // the dashed segment visually continues from exactly where the solid one ends.
      forecast: forecast?.length && i === lastIndex ? d.netWorth : null,
    })),
    ...(forecast ?? []).map((d) => ({ name: fmtLabel(d.date), actual: null, forecast: d.netWorth })),
  ];
  const tickInterval = Math.max(0, Math.ceil(display.length / TICK_COUNT) - 1);

  return (
    <ResponsiveContainer width="100%" height={190}>
      <LineChart data={display} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <defs>
          {/*
            gradientUnits="userSpaceOnUse" (with %, resolved against the SVG viewport) instead of
            the default objectBoundingBox — when net worth hasn't changed between the two most
            recent points, the line is perfectly horizontal, giving it a zero-height bounding box.
            objectBoundingBox gradients degenerate (and silently fail to paint at all) on a
            zero-height/zero-width bbox, which is exactly what made the line disappear here.
          */}
          <linearGradient id="netWorthLineGradient" gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.1} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={1} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="currentColor" strokeOpacity={0} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
          axisLine={false}
          tickLine={false}
          interval={tickInterval}
          textAnchor="middle"
        />
        <YAxis
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
          width={32}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "currentColor", strokeOpacity: 0.1, strokeWidth: 1 }} />
        <Line
          type="monotone"
          dataKey="actual"
          stroke="#c8cbd0"
          strokeWidth={2}
          isAnimationActive={false}
          dot={(props: { cx?: number; cy?: number; index?: number }) => (
            <EndDot key={props.index} {...props} dataLength={data.length} />
          )}
          activeDot={{ r: 4, strokeWidth: 0, fill: "white" }}
          connectNulls
        />
        {forecast && forecast.length > 0 && (
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#c8cbd0"
            strokeOpacity={0.55}
            strokeWidth={2}
            strokeDasharray="5 4"
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: "white" }}
            connectNulls
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

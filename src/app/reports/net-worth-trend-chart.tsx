"use client";

import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useLocale, useTranslations } from "next-intl";
import { formatEur } from "@/lib/format";
import { SplitEur } from "@/components/split-eur";

interface Point {
  date: string; // YYYY-MM-DD
  netWorth: number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey?: string; value: number }>; label?: string }) {
  const t = useTranslations("insights");
  if (!active || !payload?.length) return null;
  // Both dataKeys can be present at the actual/forecast junction point — prefer
  // "actual" there so the boundary reads as a real value, not a projection.
  const point = payload.find((p) => p.dataKey === "actual") ?? payload[0];
  const isForecast = point.dataKey === "forecast";
  return (
    <div className="rounded-tile border border-line bg-surface px-3 py-2 text-xs shadow-float">
      <p className="mono-label mb-1 text-[10px]">
        {label}{isForecast && ` · ${t("forecastPoint")}`}
      </p>
      <p className="font-bold tabular-nums text-ink"><SplitEur formatted={formatEur(point.value)} /></p>
    </div>
  );
}

function EndDot(props: { cx?: number; cy?: number; index?: number; dataLength: number }) {
  const { cx, cy, index, dataLength } = props;
  if (index !== dataLength - 1 || cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={4.5} fill="var(--arca-ink)" stroke="var(--arca-surface)" strokeWidth={2} />;
}

// Number of x-axis labels to show, regardless of how many data points there are —
// picked (rather than left to Recharts' "preserveStartEnd", which only guarantees
// the first/last and otherwise skips unevenly) so the visible period labels sit at
// a consistent gap from each other.
const TICK_COUNT = 5;

export function NetWorthTrendChart({ data, forecast }: { data: Point[]; forecast?: Point[] }) {
  const locale = useLocale();
  const fmtLabel = (date: string) => new Date(date + "T00:00:00").toLocaleDateString(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "short" });
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
      {/* V5: the ink line over a mustard fill; the forecast continues dashed in ink-3. */}
      <ComposedChart data={display} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="netWorthFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--arca-accent)" stopOpacity={0.3} />
            <stop offset="1" stopColor="var(--arca-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="2 4" stroke="var(--arca-line)" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "var(--arca-ink-3)" }}
          axisLine={false}
          tickLine={false}
          interval={tickInterval}
          textAnchor="middle"
        />
        <YAxis
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 10, fill: "var(--arca-ink-3)" }}
          width={32}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--arca-line)", strokeWidth: 1 }} />
        <Area
          type="monotone"
          dataKey="actual"
          stroke="var(--arca-ink)"
          strokeWidth={2.5}
          fill="url(#netWorthFill)"
          isAnimationActive={false}
          dot={(props: { cx?: number; cy?: number; index?: number }) => (
            <EndDot key={props.index} {...props} dataLength={data.length} />
          )}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--arca-surface)", fill: "var(--arca-ink)" }}
          connectNulls
        />
        {forecast && forecast.length > 0 && (
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="var(--arca-ink-3)"
            strokeWidth={2}
            strokeDasharray="4 5"
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--arca-surface)", fill: "var(--arca-ink-3)" }}
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

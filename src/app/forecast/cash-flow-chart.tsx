"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceDot } from "recharts";
import { useLocale } from "next-intl";
import { formatEur, formatCompactEur } from "@/lib/format";
import { signedForecastEur, type ForecastEvent, type ForecastPoint } from "@/lib/cash-flow-forecast-shared";

// Projected cash flow across the horizon. The one thing this has to make obvious is
// *when* the line dips — so the area is split at zero (income green above, expense red
// below), the lowest point is pinned with a marker, and only days that actually move
// money get a dot rather than drawing all 90.
//
// Axis/grid/tooltip treatment follows NetWorthTrendChart (the Analytics portal's other
// line chart) so the two read as the same family.

const TICK_COUNT = 5;

interface ChartRow {
  date: string;
  label: string;
  amount: number;
  change: number;
  events: ForecastEvent[];
  isToday: boolean;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartRow }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="max-w-[14rem] rounded-tile border border-line bg-surface px-3.5 py-2.5 text-xs shadow-float">
      <p className="mono-label mb-1 text-[10px]">{row.label}</p>
      <p className="font-semibold tabular-nums text-ink">{signedForecastEur(row.amount)}</p>
      {row.events.map((event) => (
        <div key={event.key} className="mt-1.5 flex items-center gap-2 min-w-0">
          <span
            className="size-2 rounded-full shrink-0"
            style={{ background: event.amount >= 0 ? "var(--arca-positive)" : "var(--arca-ink)" }}
          />
          <span className="truncate text-ink-2">{event.name}</span>
          <span className="ml-auto shrink-0 pl-3 font-semibold tabular-nums text-ink">
            {event.amount >= 0 ? "+" : "−"}{formatEur(Math.abs(event.amount))}
          </span>
        </div>
      ))}
    </div>
  );
}

// Only days that move money get a marker, coloured by that day's net direction.
// Today gets a ringed "you are here" dot.
function EventDot(props: { cx?: number; cy?: number; payload?: ChartRow }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  if (payload.isToday) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill="none" stroke="var(--arca-ink)" strokeOpacity={0.3} strokeWidth={2} />
        <circle cx={cx} cy={cy} r={3.5} fill="var(--arca-ink)" />
      </g>
    );
  }
  if (payload.events.length === 0) return null;
  return <circle cx={cx} cy={cy} r={3} fill={payload.change >= 0 ? "var(--arca-positive)" : "var(--arca-ink-3)"} />;
}

export function CashFlowChart({
  points,
  events,
  lowest,
  threshold,
}: {
  points: ForecastPoint[];
  events: ForecastEvent[];
  lowest: { amount: number; date: string } | null;
  /** The low-balance warning level, drawn as the dashed safety line. */
  threshold?: number;
}) {
  const locale = useLocale();
  const today = points[0]?.date;
  const eventsByDate = new Map<string, ForecastEvent[]>();
  for (const event of events) {
    const list = eventsByDate.get(event.date) ?? [];
    list.push(event);
    eventsByDate.set(event.date, list);
  }

  const rows: ChartRow[] = points.map((p) => ({
    date: p.date,
    label: new Date(`${p.date}T00:00:00`).toLocaleDateString(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "short" }),
    amount: p.amount,
    change: p.change,
    events: eventsByDate.get(p.date) ?? [],
    isToday: p.date === today,
  }));

  const values = rows.map((r) => r.amount);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  // Where y=0 sits as a fraction of the chart's vertical span — the gradient stop that
  // splits the fill into "above water" and "underwater".
  const zeroOffset = max === min ? 1 : max / (max - min);

  const tickInterval = Math.max(0, Math.ceil(rows.length / TICK_COUNT) - 1);
  const lowestRow = lowest ? rows.find((r) => r.date === lowest.date) : null;

  return (
    <ResponsiveContainer width="100%" height={190}>
      <AreaChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <defs>
          {/*
            gradientUnits="userSpaceOnUse" for the same reason NetWorthTrendChart uses it:
            a perfectly flat line has a zero-height bounding box, and objectBoundingBox
            gradients silently fail to paint on one.
          */}
          {/* V5: the ink line over a mustard fill above zero; below zero it turns negative red. */}
          <linearGradient id="cashFlowStroke" gradientUnits="userSpaceOnUse" x1="0" y1="0%" x2="0" y2="100%">
            <stop offset={zeroOffset} stopColor="var(--arca-ink)" />
            <stop offset={zeroOffset} stopColor="var(--arca-negative)" />
          </linearGradient>
          <linearGradient id="cashFlowFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset={0} stopColor="var(--arca-accent)" stopOpacity={0.32} />
            <stop offset={zeroOffset} stopColor="var(--arca-accent)" stopOpacity={0.03} />
            <stop offset={zeroOffset} stopColor="var(--arca-negative)" stopOpacity={0.15} />
            <stop offset={1} stopColor="var(--arca-negative)" stopOpacity={0.3} />
          </linearGradient>
        </defs>

        <CartesianGrid vertical={false} strokeDasharray="2 4" stroke="var(--arca-line)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "var(--arca-ink-3)" }}
          axisLine={false}
          tickLine={false}
          interval={tickInterval}
          textAnchor="middle"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--arca-ink-3)" }}
          axisLine={false}
          tickLine={false}
          width={46}
          tickFormatter={(v: number) => formatCompactEur(v)}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--arca-line)" }} />

        {/* Zero line — only meaningful when the forecast actually goes underwater. */}
        {min < 0 && <ReferenceLine y={0} stroke="var(--arca-negative)" strokeDasharray="3 3" strokeOpacity={0.6} />}
        {/* The safety line: below it the forecast reads as a warning. */}
        {threshold != null && threshold > 0 && threshold <= max * 1.2 && (
          <ReferenceLine y={threshold} stroke="var(--arca-negative)" strokeDasharray="4 4" />
        )}

        <Area
          type="monotone"
          dataKey="amount"
          stroke="url(#cashFlowStroke)"
          strokeWidth={2.5}
          fill="url(#cashFlowFill)"
          dot={<EventDot />}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />

        {/* Lowest projected point */}
        {lowestRow && (
          <ReferenceDot
            x={lowestRow.label}
            y={lowestRow.amount}
            r={5}
            fill={lowestRow.amount < 0 ? "var(--arca-negative)" : "var(--arca-warning)"}
            stroke="var(--arca-surface)"
            strokeWidth={2}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from "recharts";
import { formatEur, MONTH_NAMES, currencySymbol } from "@/lib/format";
import { useDashboardShouldAnimate } from "@/lib/dashboard-animation";
import { SegmentedControl } from "@/components/segmented-control";

interface BarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: { Needs: number; Wants: number };
}

/**
 * Recharts' `radius` prop on <Bar> is fixed for the whole series, but in a stacked chart whether
 * a segment should render fully rounded (vs. only on the side touching the next segment) depends
 * on whether the *other* series is zero for that specific x-value — e.g. a day with Vast spending
 * but no Variabel should show Vast as a complete rounded pill, not a flat-topped block. A custom
 * shape lets us pick the radius per-bar from that bar's own data point.
 */
function makeRoundedBar(getRadius: (payload: { Needs: number; Wants: number }) => [number, number, number, number]) {
  return function RoundedBar({ x = 0, y = 0, width = 0, height = 0, fill, payload }: BarShapeProps) {
    if (width <= 0 || height <= 0) return null;
    const [tl, tr, br, bl] = getRadius(payload ?? { Needs: 0, Wants: 0 });
    const maxR = Math.min(width, height) / 2;
    const [rTl, rTr, rBr, rBl] = [tl, tr, br, bl].map((r) => Math.min(r, maxR));
    const d = `
      M${x + rTl},${y}
      L${x + width - rTr},${y}
      Q${x + width},${y} ${x + width},${y + rTr}
      L${x + width},${y + height - rBr}
      Q${x + width},${y + height} ${x + width - rBr},${y + height}
      L${x + rBl},${y + height}
      Q${x},${y + height} ${x},${y + height - rBl}
      L${x},${y + rTl}
      Q${x},${y} ${x + rTl},${y}
      Z
    `;
    return <path d={d} fill={fill} />;
  };
}

interface MonthlyData {
  month: string;
  income: number;
  expense: number;
  /** Pre-formatted x-axis label, bypassing the month("YYYY-MM")/day("YYYY-MM-DD")
   * auto-detection below — used for week-of-month buckets (e.g. "Week 1"), which
   * don't fit either format. */
  label?: string;
}

interface CategoryData {
  name: string;
  total: number;
  group: string;
  color?: string | null;
}

const FALLBACK_COLORS = [
  "#6366f1", "#0f766e", "#f59e0b", "#f43f5e", "#38bdf8", "#a78bfa", "#fb923c",
];

export function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-card-glass px-3.5 py-2.5 text-xs">
      <p className="text-foreground/60 font-semibold mb-2 uppercase tracking-wider text-[10px]">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="size-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-foreground">{p.name}</span>
          <span className="font-bold tabular-nums ml-auto pl-4">{formatEur(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function MonthlyLineChart({ data }: { data: MonthlyData[] }) {
  const display = data.map((d) => {
    if (d.label) return { name: d.label, Income: d.income, Expenses: d.expense };
    // `month` holds either "YYYY-MM" (monthly buckets) or "YYYY-MM-DD" (daily buckets, for short ranges)
    const isDaily = d.month.length === 10;
    const name = isDaily
      ? new Date(d.month + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      : MONTH_NAMES[(parseInt(d.month.slice(5)) - 1)]?.slice(0, 3) ?? d.month;
    return { name, Income: d.income, Expenses: d.expense };
  });

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={display} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid
          vertical={false}
          strokeDasharray="4 4"
          stroke="currentColor"
          strokeOpacity={0}
        />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `${currencySymbol()}${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
          width={36}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "currentColor", strokeOpacity: 0.1, strokeWidth: 1 }} />
        <Line
          type="monotone"
          dataKey="Income"
          stroke="var(--color-income)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0, fill: "#c8cbd0" }}
        />
        <Line
          type="monotone"
          dataKey="Expenses"
          stroke="#c8cbd0"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0, fill: "#c8cbd0" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface WeeklyBarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: { Expenses: number; isToday: boolean };
}

function WeeklyBar({ x = 0, y = 0, width = 0, height = 0, payload }: WeeklyBarShapeProps) {
  if (width <= 0 || height <= 0) return null;
  const r = Math.min(12, width / 2, height / 2);
  if (!payload?.isToday) {
    return <rect x={x} y={y} width={width} height={height} rx={r} ry={r} fill="var(--muted)" />;
  }
  const gradId = "weekly-bar-grad";
  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f5e5a" />
          <stop offset="60%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#6ee7b7" />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={width} height={height} rx={r} ry={r} fill={`url(#${gradId})`} />
    </g>
  );
}

interface TodayLabelProps {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  index?: number;
  dataLength: number;
  value?: string | number | null;
}

/** Floating "today" amount badge above the last bar — rendered via LabelList (a sibling of the
 * bars) rather than baked into the bar's own shape, since Recharts clips custom bar shapes to
 * the bar's own rect and silently hides anything drawn outside it (like a badge above the bar). */
function TodayLabel({ x = 0, y = 0, width = 0, index, dataLength, value }: TodayLabelProps) {
  if (index !== dataLength - 1 || value == null) return null;
  const [nx, ny, nwidth] = [Number(x), Number(y), Number(width)];
  const label = formatEur(Number(value));
  const badgeWidth = Math.max(40, label.length * 6.5 + 16);
  // Right-align to the bar's own right edge instead of centering — this is always the last
  // (rightmost) bar, so centering would push the badge's right half past the chart's edge.
  const badgeX = nx + nwidth - badgeWidth;
  return (
    <g>
      <rect x={badgeX} y={ny - 26} width={badgeWidth} height={20} rx={6} fill="var(--foreground)" />
      <text x={badgeX + badgeWidth / 2} y={ny - 12} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--background)">
        {label}
      </text>
    </g>
  );
}

/** 7-day expense bar chart for the dashboard's "Spending this week" card — same Recharts setup
 * (grid, tooltip, axis treatment) as the other dashboard/reports charts, but fills whatever
 * height its container actually has (the card is height-matched to the "Still to pay"
 * ComparisonCard next to it) rather than forcing its own fixed height. */
export function WeeklyExpenseBarChart({ data }: { data: { date: string; amount: number }[] }) {
  const display = data.map((d, i) => ({
    name: new Date(d.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2),
    label: new Date(d.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
    Expenses: d.amount,
    isToday: i === data.length - 2,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={display} margin={{ top: 20, right: 0, bottom: 0, left: 0 }} barCategoryGap="5%">
        <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.06} />
        <XAxis
          dataKey="name"
          tick={(props: { x: string | number; y: string | number; payload: { value: string } }) => (
            <text x={props.x} y={props.y} dy={12} textAnchor="middle" fontSize={12} className="fill-foreground/40">
              {props.payload.value}
            </text>
          )}
          axisLine={false}
          tickLine={false}
          height={20}
          tickMargin={0}
        />
        <YAxis
          tickFormatter={(v) => `${currencySymbol()}${v}`}
          tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
          width={40}
          axisLine={false}
          tickLine={false}
          tickCount={4}
        />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ fill: "currentColor", fillOpacity: 0.05 }}
          labelFormatter={(_, p) => p?.[0]?.payload?.label}
        />
        <Bar dataKey="Expenses" name="Expenses" fill="var(--chart-1)" shape={WeeklyBar} maxBarSize={52} isAnimationActive={true}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <LabelList dataKey="Expenses" content={(props: any) => <TodayLabel {...props} dataLength={display.length} />} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Cumulative net-balance line for the dashboard's wallet hero card — sits directly on
 * the gradient hero background (not a card), so it's styled in white/translucent tones
 * instead of the `--chart-*`/`currentColor` tokens every other chart in this file uses. */
export function WalletBalanceLineChart({ data }: { data: { date: string; balance: number }[] }) {
  const shouldAnimate = useDashboardShouldAnimate();
  const today = new Date().toISOString().slice(0, 10);

  const display = data.map((d) => ({
    date: d.date,
    past: d.date <= today ? d.balance : null,
    future: d.date >= today ? d.balance : null,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={display} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="walletBalGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
          </linearGradient>
        </defs>

        <YAxis hide domain={["dataMin", "dataMax"]} />

        <Tooltip
          cursor={{ stroke: "#ffffff", strokeOpacity: 0.25, strokeWidth: 1 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="rounded-xl bg-black/70 backdrop-blur px-3 py-2 text-xs text-white">
                <p className="text-white/60 mb-0.5">
                  {new Date(`${String(payload[0].payload.date)}T00:00:00`).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
                <p className="font-bold tabular-nums">
                  {formatEur(Number(payload[0].value ?? payload[1]?.value))}
                </p>
              </div>
            ) : null
          }
        />

        <Area
          type="monotone"
          dataKey="past"
          stroke="#ffffff"
          strokeWidth={2}
          fill="url(#walletBalGrad)"
          baseValue="dataMin"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0, fill: "#ffffff" }}
          connectNulls
          isAnimationActive={shouldAnimate}
        />

        <Area
          type="monotone"
          dataKey="future"
          stroke="#ffffff5d"
          strokeWidth={2}
          strokeDasharray="6 6"
          fill="none"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0, fill: "#ffffff" }}
          connectNulls
          isAnimationActive={shouldAnimate}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Compact balance sparkline for cards sitting on the flat card background (unlike
 * `WalletBalanceLineChart`, which is styled for the gradient hero) — same shape as the
 * Accounts settings panel's balance chart, sized down for the dashboard. */
export function BalanceSparkline({ data }: { data: { date: string; balance: number }[] }) {
  const shouldAnimate = useDashboardShouldAnimate();
  const display = data.map((d) => ({ date: d.date, value: d.balance }));
  const negative = display[display.length - 1].value < 0;
  const color = negative ? "var(--destructive)" : "var(--success)";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={display} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="balanceSparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.5}
          fill="url(#balanceSparkGrad)"
          baseValue="dataMin"
          dot={false}
          activeDot={false}
          isAnimationActive={shouldAnimate}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export type NeedsWantsFilter = "beide" | "nodig" | "willen";

// Chart token, not --secondary: the secondary surface color is translucent in dark
// mode and would render this series nearly invisible.
const NEEDS_COLOR = "var(--chart-2)";

const NEEDS_WANTS_OPTIONS = [
  { key: "beide", label: "Both" },
  { key: "nodig", label: "Needs" },
  { key: "willen", label: "Wants" },
] as const;

export function NeedsWantsFilterControl({
  filter,
  onChange,
}: {
  filter: NeedsWantsFilter;
  onChange: (filter: NeedsWantsFilter) => void;
}) {
  return <SegmentedControl value={filter} onChange={onChange} options={NEEDS_WANTS_OPTIONS} />;
}

export function NeedsWantsBarChart({
  data,
  filter,
}: {
  data: { month: string; nodig: number; willen: number }[];
  filter: NeedsWantsFilter;
}) {
  const showNeeds = filter === "beide" || filter === "nodig";
  const showWants = filter === "beide" || filter === "willen";
  const stacked = filter === "beide";

  const display = data.map((d) => {
    // `month` holds either "YYYY-MM" (monthly buckets) or "YYYY-MM-DD" (daily buckets, for short ranges)
    const isDaily = d.month.length === 10;
    const name = isDaily
      ? new Date(d.month + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      : MONTH_NAMES[(parseInt(d.month.slice(5)) - 1)]?.slice(0, 3) ?? d.month;
    // Both bars stay mounted at all times (zeroed out when hidden) — conditionally mounting/
    // unmounting them confuses Recharts' stack-order bookkeeping when the insertion order of
    // the two <Bar> children changes (e.g. "willen" -> "beide" inserts Needs *before* an
    // already-mounted Wants), producing an inverted/mis-scaled bar.
    return { name, Needs: showNeeds ? d.nodig : 0, Wants: showWants ? d.willen : 0 };
  });

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={display} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid
            vertical={false}
            strokeDasharray="4 4"
            stroke="currentColor"
            strokeOpacity={0}
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${currencySymbol()}${(v / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
            width={36}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "currentColor", fillOpacity: 0.05 }} />
          <Bar
            dataKey="Needs"
            fill={NEEDS_COLOR}
            shape={makeRoundedBar((p) => (stacked && p.Wants > 0 ? [0, 0, 5, 5] : [5, 5, 5, 5]))}
            maxBarSize={32}
            stackId="a"
          />
          <Bar
            dataKey="Wants"
            fill="var(--primary)"
            shape={makeRoundedBar((p) => (stacked && p.Needs > 0 ? [5, 5, 0, 0] : [5, 5, 5, 5]))}
            maxBarSize={32}
            stackId="a"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function EarningsDonut({ income, expense }: { income: number; expense: number }) {
  const remaining = Math.max(income - expense, 0);
  const spentPct = income > 0 ? Math.round((expense / income) * 100) : 0;

  const donutData =
    income > 0
      ? [
          { name: "Expenses", value: expense },
          { name: "Balance", value: remaining },
        ]
      : [{ name: "Leeg", value: 1 }];

  return (
    <div className="relative flex justify-center items-center">
      <ResponsiveContainer width="100%" height={150}>
        <PieChart>
          <Pie
            data={donutData}
            innerRadius={55}
            outerRadius={62}
            startAngle={90}
            endAngle={-270}
            strokeWidth={0}
            paddingAngle={income > 0 ? 3 : 0}
            cornerRadius={6}
          >
            <Cell fill="var(--color-income)" />
            <Cell fill="var(--color-expense)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-sm font-bold tabular-nums leading-tight">{formatEur(income)}</p>
        <p
          className="text-[11px] font-semibold mt-0.5"
          style={{ color: spentPct <= 90 ? "var(--success)" : "var(--danger)" }}
        >
          <span>{spentPct > 0 ? `${spentPct}% besteed` : "no data"}</span>
        </p>
      </div>
    </div>
  );
}

/** Projected total debt balance over time (area, declining to zero) with one dashed line per
 * individual debt overlaid — based on minimum payments only (no interest-rate data exists). */
export function DebtPayoffChart({
  data,
  series,
}: {
  data: Array<{ name: string; [key: string]: number | string }>;
  series: { key: string; label: string; color: string }[];
}) {
  const tickInterval = Math.max(0, Math.ceil(data.length / 6) - 1);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="debtPayoffGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-expense)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-expense)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="currentColor" strokeOpacity={0} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
          axisLine={false}
          tickLine={false}
          interval={tickInterval}
        />
        <YAxis
          tickFormatter={(v) => `${currencySymbol()}${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
          width={36}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "currentColor", strokeOpacity: 0.1, strokeWidth: 1 }} />
        <Area
          type="monotone"
          dataKey="Total"
          stroke="var(--color-expense)"
          strokeWidth={2.5}
          fill="url(#debtPayoffGrad)"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0, fill: "var(--color-expense)" }}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.label}
            stroke={s.color}
            strokeWidth={1.5}
            strokeOpacity={0}
            strokeDasharray="4 3"
            dot={false}
            activeDot={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Keep backward compat alias
export { MonthlyLineChart as MonthlyBarChart };

export function ExpensePieChart({ data }: { data: CategoryData[] }) {
  const sorted = [...data].sort((a, b) => b.total - a.total);
  const max = sorted[0]?.total ?? 1;

  return (
    <div className="space-y-4">
      {sorted.map((entry, i) => {
        const pct = (entry.total / max) * 100;
        const color = entry.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
        return (
          <div key={entry.name}>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="truncate font-medium">{entry.name}</span>
              </div>
              <span className="text-foreground/60 text-xs tabular-nums ml-4 shrink-0">
                {formatEur(entry.total)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-foreground overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

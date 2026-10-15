"use client";

import {
  LineChart,
  Line,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useLocale } from "next-intl";
import { formatEur, currencySymbol } from "@/lib/format";
import { useDashboardShouldAnimate } from "@/lib/dashboard-animation";

interface MonthlyData {
  month: string;
  income: number;
  expense: number;
  /** Pre-formatted x-axis label, bypassing the month("YYYY-MM")/day("YYYY-MM-DD")
   * auto-detection below — used for week-of-month buckets (e.g. "Week 1"), which
   * don't fit either format. */
  label?: string;
}

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
    <div className="rounded-tile border border-line bg-surface px-3.5 py-2.5 text-xs shadow-float">
      <p className="mono-label mb-2 text-[10px]">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="size-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-ink-2">{p.name}</span>
          <span className="font-bold tabular-nums ml-auto pl-4">{formatEur(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function MonthlyLineChart({ data, labels }: { data: MonthlyData[]; labels?: { income: string; expenses: string } }) {
  const locale = useLocale();
  const dateLocale = locale === "nl" ? "nl-NL" : "en-GB";
  const incomeKey = labels?.income ?? "Income";
  const expensesKey = labels?.expenses ?? "Expenses";
  const display = data.map((d) => {
    if (d.label) return { name: d.label, [incomeKey]: d.income, [expensesKey]: d.expense };
    // `month` holds either "YYYY-MM" (monthly buckets) or "YYYY-MM-DD" (daily buckets, for short ranges)
    const isDaily = d.month.length === 10;
    const name = isDaily
      ? new Date(d.month + "T00:00:00").toLocaleDateString(dateLocale, { day: "numeric", month: "short" })
      : new Date(`${d.month}-15T12:00:00`).toLocaleDateString(dateLocale, { month: "short" });
    return { name, [incomeKey]: d.income, [expensesKey]: d.expense };
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
          tick={{ fontSize: 10, fill: "var(--arca-ink-3)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `${currencySymbol()}${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 10, fill: "var(--arca-ink-3)" }}
          width={36}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "currentColor", strokeOpacity: 0.1, strokeWidth: 1 }} />
        {/* V5: income in positive green, expenses as the ink line. */}
        <Line
          type="monotone"
          dataKey={incomeKey}
          stroke="var(--arca-positive)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--arca-surface)", fill: "var(--arca-positive)" }}
        />
        <Line
          type="monotone"
          dataKey={expensesKey}
          stroke="var(--arca-ink)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--arca-surface)", fill: "var(--arca-ink)" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

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


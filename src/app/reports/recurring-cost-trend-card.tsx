"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatEur, MONTH_NAMES, currencySymbol } from "@/lib/format";
import { SplitEur } from "@/components/split-eur";

interface Point {
  month: string; // YYYY-MM
  bill: number;
  subscription: number;
  debt: number;
}

function ChartTooltip({
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
    <div className="rounded-xl bg-card-glass px-3.5 py-2.5 shadow-2xl text-xs">
      <p className="text-foreground/60 font-medium mb-2 uppercase tracking-wider text-[10px]">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="size-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-foreground">{p.name}</span>
          <span className="font-bold tabular-nums ml-auto pl-4"><SplitEur formatted={formatEur(p.value)} /></span>
        </div>
      ))}
    </div>
  );
}

export function RecurringCostTrendCard({ data }: { data: Point[] }) {
  const display = data.map((d) => ({
    name: MONTH_NAMES[parseInt(d.month.slice(5)) - 1]?.slice(0, 3) ?? d.month,
    Bills: d.bill,
    Subscriptions: d.subscription,
    Debts: d.debt,
  }));

  return (
    <div className="rounded-2xl bg-card p-5">
      <h2 className="text-sm font-semibold mb-1">Fixed costs</h2>
      <p className="text-xs text-foreground/60 mb-3">Last 12 months</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={display} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="currentColor" strokeOpacity={0} />
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
          <Bar dataKey="Bills" stackId="a" fill="var(--chart-1)" radius={[0, 0, 0, 0]} maxBarSize={28} />
          <Bar dataKey="Subscriptions" stackId="a" fill="var(--chart-2)" radius={[0, 0, 0, 0]} maxBarSize={28} />
          <Bar dataKey="Debts" stackId="a" fill="var(--chart-3)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { MONTH_NAMES, currencySymbol } from "@/lib/format";
import { ChartTooltip } from "@/components/dashboard-charts";

interface DataPoint {
  month: string;
  netWorth: number;
  savings: number;
  debt: number;
}

function shortMonth(ym: string) {
  const [, m] = ym.split("-");
  return MONTH_NAMES[Number(m) - 1]?.slice(0, 3) ?? ym;
}

function fmtEur(v: number) {
  const symbol = currencySymbol();
  if (Math.abs(v) >= 1000) return `${symbol}${(v / 1000).toFixed(0)}k`;
  return `${symbol}${Math.round(v)}`;
}

export function NetworthChart({ data }: { data: DataPoint[] }) {
  const display = data.map((d) => ({
    ...d,
    monthLabel: shortMonth(d.month),
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={display} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="currentColor" strokeOpacity={0} />
        <XAxis
          dataKey="monthLabel"
          tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={fmtEur}
          tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "currentColor", strokeOpacity: 0.1, strokeWidth: 1 }} />
        <Line type="monotone" dataKey="savings" name="Spaargeld" stroke="var(--color-income)" strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: "#c8cbd0" }} isAnimationActive={false} />
        <Line type="monotone" dataKey="debt" name="Debts" stroke="var(--color-expense)" strokeWidth={2} dot={false} strokeDasharray="4 2" activeDot={{ r: 3, strokeWidth: 0, fill: "#c8cbd0" }} isAnimationActive={false} />
        <Line type="monotone" dataKey="netWorth" name="Net worth" stroke="var(--chart-3)" strokeWidth={2.5} dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: "#c8cbd0" }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

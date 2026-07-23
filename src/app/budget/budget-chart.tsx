"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { formatEur, currencySymbol } from "@/lib/format";

interface Props {
  nodig: number;
  willen: number;
  sparen: number;
  income: number;
}

export function BudgetChart({ nodig, willen, sparen, income }: Props) {
  const data = [
    { name: "Nodig (60%)", werkelijk: nodig, doel: income * 0.60, fill: "var(--color-nodig)" },
    { name: "Willen (25%)", werkelijk: willen, doel: income * 0.25, fill: "var(--color-willen)" },
    { name: "Savings (15%)", werkelijk: sparen, doel: income * 0.15, fill: "var(--color-sparen)" },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={(v) => `${currencySymbol()}${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} width={42} />
        <Tooltip formatter={(v) => formatEur(Number(v))} />
        <Bar dataKey="doel" name="Goal" fill="#e2e8f0" radius={[3, 3, 0, 0]} />
        <Bar dataKey="werkelijk" name="Werkelijk" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

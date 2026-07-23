"use client";

import { useState } from "react";
import { formatEur } from "@/lib/format";

export interface PieGroup {
  group: string;
  label: string;
  categories: { name: string; color: string | null; total: number }[];
}

function DonutPie({ slices }: { slices: { name: string; color: string; value: number; pct: number }[] }) {
  const r = 70, cx = 90, cy = 90, stroke = 28;
  const circ = 2 * Math.PI * r;

  const slicesWithOffset = slices.reduce<{ name: string; color: string; value: number; pct: number; offset: number }[]>(
    (acc, s) => {
      const prevEnd = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].pct : 0;
      return [...acc, { ...s, offset: prevEnd }];
    },
    [],
  );

  return (
    <svg viewBox="0 0 180 180" className="size-44 shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeOpacity="0.06" strokeWidth={stroke} />
      {slicesWithOffset.map((s) => {
        const dash = (s.pct / 100) * circ;
        return (
          <circle
            key={s.name}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ}`}
            strokeDashoffset={-s.offset * circ / 100}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11" fontWeight="bold" fill="currentColor">Top 5</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.5">categories</text>
    </svg>
  );
}

// The app's own chart palette (defined in globals.css), same convention as
// TopExpenseCategoriesCard — used positionally since two categories can share a color.
const SLICE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function CategoryPieClient({ groups }: { groups: PieGroup[] }) {
  const expenseGroups = groups.filter((g) => g.group !== "income");
  const [selected, setSelected] = useState<string | null>(null);

  const activeGroups = selected ? expenseGroups.filter((g) => g.group === selected) : expenseGroups;
  const allCats = activeGroups.flatMap((g) => g.categories).filter((c) => c.total > 0);
  allCats.sort((a, b) => b.total - a.total);

  const top5 = allCats.slice(0, 5);
  const restTotal = allCats.slice(5).reduce((s, c) => s + c.total, 0);
  const grandTotal = allCats.reduce((s, c) => s + c.total, 0);

  const slices = [
    ...top5.map((c, i) => ({
      name: c.name,
      color: SLICE_COLORS[i % SLICE_COLORS.length],
      value: c.total,
      pct: grandTotal > 0 ? (c.total / grandTotal) * 100 : 0,
    })),
    ...(restTotal > 0
      ? [{ name: "Overig", color: "#94a3b8", value: restTotal, pct: grandTotal > 0 ? (restTotal / grandTotal) * 100 : 0 }]
      : []),
  ];

  return (
    <div className="space-y-4">
      {/* Group filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelected(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            selected === null ? "bg-primary text-primary-foreground" : "bg-foreground/5 text-foreground/60 hover:bg-foreground/10"
          }`}
        >
          Alles
        </button>
        {expenseGroups.map((g) => (
          <button
            key={g.group}
            onClick={() => setSelected(selected === g.group ? null : g.group)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              selected === g.group ? "bg-primary text-primary-foreground" : "bg-foreground/5 text-foreground/60 hover:bg-foreground/10"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {allCats.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No expenses in this period.</p>
      ) : (
        <div className="flex items-center gap-6 flex-wrap">
          <DonutPie slices={slices} />
          <div className="flex-1 min-w-0 space-y-2">
            {slices.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-sm">
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="flex-1 truncate text-muted-foreground">{s.name}</span>
                <span className="font-medium tabular-nums">{formatEur(s.value)}</span>
                <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">{s.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

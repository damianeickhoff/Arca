import { IconArrowUpRight as ArrowUpRight, IconArrowDownRight as ArrowDownRight } from "@tabler/icons-react";
import { formatEur } from "@/lib/format";
import { ComparisonPicker } from "./comparison-picker";

export type MonthStats = {
  income: number;
  expense: number;
  balance: number;
  topCats: { name: string; color: string | null; total: number }[];
};

// Presentational only — all data (including which financial month each stat set
// represents) is resolved by the caller. Kept out of trends/page.tsx so the KPI-tile
// and delta-list markup doesn't compete for attention with the page's data plumbing.
export function MonthComparison({
  cmpA,
  cmpB,
  labelA,
  labelB,
  statsA,
  statsB,
}: {
  cmpA: string;
  cmpB: string;
  labelA: string;
  labelB: string;
  statsA: MonthStats;
  statsB: MonthStats;
}) {
  const savingsRateA = statsA.income > 0 ? (statsA.balance / statsA.income) * 100 : null;
  const savingsRateB = statsB.income > 0 ? (statsB.balance / statsB.income) * 100 : null;

  const kpis = [
    { label: "Income", a: statsA.income, b: statsB.income, format: formatEur },
    { label: "Expenses", a: statsA.expense, b: statsB.expense, format: formatEur },
    { label: "Balance", a: statsA.balance, b: statsB.balance, format: formatEur },
    {
      label: "Savings rate",
      a: savingsRateA,
      b: savingsRateB,
      format: (v: number) => `${v.toFixed(0)}%`,
    },
  ];

  // Union of categories present in either month, sorted by |delta|, capped to 8 with a
  // "show all" disclosure for the rest.
  const catMap = new Map<string, { name: string; color: string | null; a: number; b: number }>();
  for (const c of statsA.topCats) catMap.set(c.name, { name: c.name, color: c.color, a: c.total, b: 0 });
  for (const c of statsB.topCats) {
    const existing = catMap.get(c.name);
    if (existing) existing.b = c.total;
    else catMap.set(c.name, { name: c.name, color: c.color, a: 0, b: c.total });
  }
  const deltaRows = [...catMap.values()]
    .map((c) => ({ ...c, delta: c.a - c.b }))
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const topDeltas = deltaRows.slice(0, 8);
  const restCount = deltaRows.length - topDeltas.length;

  return (
    <div className="rounded-2xl bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-foreground/5 flex flex-col items-center gap-2 text-center">
        <h2 className="font-semibold text-sm">Month comparison</h2>
        <ComparisonPicker cmpA={cmpA} cmpB={cmpB} />
      </div>

      <div className="p-5 space-y-4">
        {/* KPI comparison row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.map(({ label, a, b, format }) => {
            if (a == null || b == null) {
              return (
                <div key={label} className="rounded-xl bg-foreground/3 p-3">
                  <p className="text-xs text-foreground/60 mb-1">{label}</p>
                  <p className="text-base font-bold tabular-nums text-foreground/40">—</p>
                </div>
              );
            }
            const diff = a - b;
            const diffPct = b !== 0 ? Math.round((diff / Math.abs(b)) * 100) : null;
            return (
              <div key={label} className="rounded-xl bg-foreground/3 p-3">
                <p className="text-xs text-foreground/60 mb-1">{label}</p>
                <div className="flex items-end justify-between gap-1 flex-wrap">
                  <div>
                    <p className="text-base font-bold tabular-nums">{format(a)}</p>
                    <p className="text-[10px] text-foreground/50 tabular-nums">{labelB}: {format(b)}</p>
                  </div>
                  {diffPct !== null && (
                    <span
                      className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full"
                      style={diff > 0
                        ? { background: "color-mix(in srgb, var(--color-income) 15%, transparent)", color: "var(--color-income)" }
                        : diff < 0
                          ? { background: "color-mix(in srgb, var(--color-expense) 15%, transparent)", color: "var(--color-expense)" }
                          : undefined}
                    >
                      {diff > 0 ? "+" : ""}{diffPct}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Per-category deltas, unified single list */}
        {topDeltas.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground/60 mb-2">{labelA} vs {labelB}</p>
            {topDeltas.map((row) => {
              const up = row.delta > 0;
              const flat = row.delta === 0;
              return (
                <div key={row.name} className="flex items-center justify-between gap-2 py-1.5 border-b border-foreground/5 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: row.color ?? "var(--primary)" }} />
                    <span className="text-sm truncate">{row.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs tabular-nums">
                    <span className="text-foreground/50">{formatEur(row.b)} → {formatEur(row.a)}</span>
                    {!flat && (
                      <span className={`flex items-center font-semibold ${up ? "text-red-500" : "text-emerald-600"}`}>
                        {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                        {formatEur(Math.abs(row.delta))}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {restCount > 0 && (
              <p className="text-xs text-foreground/50 pt-1">+{restCount} more categories</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-foreground/50">No data</p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { CategoryDetailPortal } from "@/components/category-detail-portal";
import type { FinancialMonthConfig } from "@/lib/date-range";

interface Cat {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  monthly: Record<string, number>;
  total: number;
}

interface Group {
  group: string;
  label: string;
  categories: Cat[];
}

// A compact 12-month mini bar chart. The last bar (current month) is drawn at full
// opacity, the rest dimmed — so the eye reads the overall shape plus "where we are now".
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const W = 84;
  const H = 30;
  const n = values.length;
  const gap = 2.5;
  const max = Math.max(...values, 1);
  const bw = (W - gap * (n - 1)) / n;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H }} className="shrink-0" aria-hidden>
      {values.map((v, i) => {
        const h = v > 0 ? Math.max((v / max) * H, 3) : 0;
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={H - h}
            width={bw}
            height={h}
            rx={1.5}
            fill={color}
            fillOpacity={i === n - 1 ? 1 : 0.3}
          />
        );
      })}
    </svg>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs transition-colors cursor-pointer ${
        active
          ? "bg-foreground/10 dark:bg-foreground/60 text-black font-bold"
          : "bg-foreground/5 dark:bg-foreground/5 text-foreground/60"
      }`}
    >
      {children}
    </button>
  );
}

const VISIBLE_COUNT = 5;

export function CategoryTrendList({
  groups,
  months,
  financialMonth,
  periodRange,
}: {
  groups: Group[];
  months: string[];
  financialMonth: FinancialMonthConfig;
  /** The [from,to] this list's totals were computed over — passed straight through
   * as the category detail portal's default period. */
  periodRange: { from: string; to: string };
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const active = sel ? groups.filter((g) => g.group === sel) : groups;
  const allCats = active
    .flatMap((g) => g.categories)
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total / months.length - a.total / months.length);
  const cats = expanded ? allCats : allCats.slice(0, VISIBLE_COUNT);

  return (
<div className="rounded-2xl bg-[var(--dialog-content-background)] p-5 relative">
  <div className="pr-32">
    <h2 className="text-sm mb-1">Expenses per category</h2>
    <p className="text-xs text-foreground/60 mb-4">Per month · last 12 months</p>
  </div>

<div className="absolute top-5 right-5 h-10 flex items-center gap-2">
        <FilterPill active={sel === null} onClick={() => setSel(null)}>
          All
        </FilterPill>
        {groups.map((g) => (
          <FilterPill key={g.group} active={sel === g.group} onClick={() => setSel(sel === g.group ? null : g.group)}>
            {g.label}
          </FilterPill>
        ))}
      </div>

      {cats.length === 0 ? (
        <p className="text-sm text-foreground/50 py-4">No expenses in this period.</p>
      ) : (
        <div className="divide-y divide-foreground/5">
          {cats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className="w-full flex items-center gap-3 py-2.5 text-left active:bg-foreground/5 transition-colors"
            >
              <Icon iconKey={c.icon} color={c.color} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-foreground/50 tabular-nums">
                  gem. {formatEur(c.total / months.length)}/mnd
                </p>
              </div>
              <Sparkline values={months.map((m) => c.monthly[m] ?? 0)} color="color-mix(in srgb, var(--foreground) 70%, transparent)" />
              <p className="text-sm font-semibold tabular-nums w-16 text-right shrink-0">{formatEur(c.total)}</p>
            </button>
          ))}
        </div>
      )}

      {allCats.length > VISIBLE_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-center text-xs font-semibold text-foreground/60 hover:text-foreground/80 transition-colors pt-3 mt-1 border-t border-foreground/5"
        >
          {expanded ? "Show less" : `Show more (${allCats.length - VISIBLE_COUNT})`}
        </button>
      )}

      <CategoryDetailPortal
        category={(() => {
          const c = allCats.find((cat) => cat.id === selectedId);
          return c ? { categoryId: c.id, categoryName: c.name, color: c.color, icon: c.icon } : null;
        })()}
        financialMonth={financialMonth}
        budgetPeriod={periodRange}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

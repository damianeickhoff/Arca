"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CategoryIcon } from "@/components/ui/category-icon";
import { SectionHead } from "@/components/ui/page-heading";
import { cn } from "@/lib/utils";
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
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-xs font-semibold transition-colors",
        active ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink-2 hover:text-ink",
      )}
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
  const t = useTranslations("insights.trends");
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
    <section className="flex flex-col gap-2 rounded-card border border-line bg-surface px-[18px] py-4 shadow-card lg:px-5">
      <SectionHead title={t("perCategory")} size="sm" />
      <p className="-mt-1 text-xs text-ink-3">{t("perCategoryNote")}</p>

      <div className="flex flex-wrap items-center gap-1.5 py-1">
        <FilterPill active={sel === null} onClick={() => setSel(null)}>
          {t("all")}
        </FilterPill>
        {groups.map((g) => (
          <FilterPill key={g.group} active={sel === g.group} onClick={() => setSel(sel === g.group ? null : g.group)}>
            {g.label}
          </FilterPill>
        ))}
      </div>

      {cats.length === 0 ? (
        <p className="py-4 text-[13px] text-ink-3">{t("noExpenses")}</p>
      ) : (
        <div className="flex flex-col">
          {cats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className="-mx-2 flex min-h-[54px] w-[calc(100%+1rem)] items-center gap-3 rounded-row px-2 text-left transition-colors hover:bg-surface-2"
            >
              <CategoryIcon icon={c.icon} color={c.color} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
                <p className="text-xs tabular-nums text-ink-3">{t("avgPerMonth", { amount: formatEur(c.total / months.length) })}</p>
              </div>
              <Sparkline values={months.map((m) => c.monthly[m] ?? 0)} color={c.color ?? "var(--arca-ink)"} />
              <p className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">{formatEur(c.total)}</p>
            </button>
          ))}
        </div>
      )}

      {allCats.length > VISIBLE_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 w-full border-t border-line pt-3 text-center text-[13px] font-semibold text-mustard-strong hover:underline underline-offset-4"
        >
          {expanded ? t("showLess") : t("showMore", { count: allCats.length - VISIBLE_COUNT })}
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
    </section>
  );
}

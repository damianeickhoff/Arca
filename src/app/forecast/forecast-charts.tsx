import { formatEur } from "@/lib/format";
import { Donut } from "@/components/ui/charts";

// ─── Expense Composition Donut ──────────────────────────────────────────────
// How the month's income is spread: a V5 donut with the total in the middle and a
// legend of each part's share.

interface DonutSegment {
  name: string;
  value: number;
  color: string;
}

export function ExpenseDonutChart({ segments }: { segments: DonutSegment[] }) {
  const total = segments.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex items-center gap-5">
      <Donut parts={segments.map((s) => ({ value: s.value, color: s.color }))} size={150}>
        <span className="amount text-base leading-none text-ink">{formatEur(total).replace(/,00$/, "")}</span>
      </Donut>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {segments.map((seg, i) => {
          const pct = total > 0 ? (seg.value / total) * 100 : 0;
          return (
            <div key={`${seg.name}-${i}`} title={formatEur(seg.value)} className="flex min-w-0 items-center gap-2.5">
              <span className="size-2 shrink-0 rounded-full" style={{ background: seg.color }} />
              <span className="truncate text-[13px] text-ink-2">{seg.name}</span>
              <span className="ml-auto shrink-0 text-[13px] font-semibold tabular-nums text-ink">{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

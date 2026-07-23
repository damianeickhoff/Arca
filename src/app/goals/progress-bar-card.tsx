import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";

// Shared visual for the two goals-page progress bars — "Left this month" (budget
// filter) and "X% reached" (savings filter) — mirroring the budget page's
// left-to-spend card and the old savings page's total-progress bar, which used
// near-identical markup.
export function ProgressBarCard({
  iconKey,
  headline,
  subtitle,
  spent,
  total,
  pct,
  rawPct,
  danger = false,
}: {
  iconKey: string;
  headline: string;
  subtitle: string;
  spent: number;
  total: number;
  pct: number;
  rawPct: number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="flex items-start justify-between mb-10">
        <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
          <div className="size-14 rounded-full shrink-0 flex items-center justify-center bg-foreground/3">
            <Icon
              iconKey={iconKey}
              size="xxl"
              gradient={["#0f5e5a", "#2dd4bf"]}
              backgroundGradient={["var(--goal-icon-bg-from)", "var(--goal-icon-bg-to)"]}
              round
            />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-base leading-tight truncate">{headline}</p>
            <p className="text-sm font-medium text-foreground/60 mt-0.5">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="relative mb-2 mt-7">
        <div
          className="absolute -top-7.5"
          style={{
            left: `${Math.max(0, Math.min(100, pct))}%`,
            transform: pct <= 12 ? "translateX(0)" : pct >= 88 ? "translateX(-100%)" : "translateX(-50%)",
          }}
        >
          <span className="bg-foreground text-background text-[11px] font-bold px-2.5 py-1 rounded-md whitespace-nowrap">
            {rawPct.toFixed(0)}%
          </span>
        </div>
        <div className="h-3.5 rounded-full overflow-hidden relative" style={{ background: "var(--gradient-goal-track)" }}>
          <div
            className="absolute top-0 left-0 bottom-0 rounded-full transition-all"
            style={{ width: `${pct}%`, background: danger ? "var(--danger)" : "var(--gradient-goal-fill)" }}
          />
        </div>
      </div>
      <div className="flex justify-between text-[14px] text-foreground/60 tabular-nums">
        <span>{formatEur(spent)}</span>
        <span>{formatEur(total)}</span>
      </div>
    </div>
  );
}

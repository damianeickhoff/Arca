import { SplitEur } from "@/components/split-eur";
import { formatEur } from "@/lib/format";

// The "My savings goals" summary card from the old /savings page, rebuilt on top of
// the unified `goals` table (goalType === "savings") instead of the legacy
// `savingsGoals` table.
export function SavingsSummaryCard({
  totalSaved,
  totalReachedPct,
  totalMonthly,
  latestTargetLabel,
}: {
  totalSaved: number;
  totalReachedPct: number;
  totalMonthly: number;
  latestTargetLabel: string | null;
}) {
  return (
    <div className="rounded-2xl bg-card p-5">
      <h2 className="font-semibold text-base mb-4">My savings goals</h2>

      <p className="text-sm text-foreground/60 mb-1">Total saved</p>
      <p className="text-4xl font-medium tabular-nums tracking-tight">
        <SplitEur formatted={formatEur(totalSaved)} />
      </p>

      <div className="grid grid-cols-3 gap-3 pt-4 mt-3">
        <div className="min-w-0 pl-2 border-l-2" style={{ borderColor: "color-mix(in srgb, var(--foreground) 20%, transparent)" }}>
          <p className="text-sm text-foreground/60 truncate">Reached</p>
          <p className="text-base font-semibold tabular-nums truncate">{totalReachedPct}%</p>
        </div>
        <div className="min-w-0 pl-2 border-l-2" style={{ borderColor: "color-mix(in srgb, var(--foreground) 20%, transparent)" }}>
          <p className="text-sm text-foreground/60 truncate">Per month</p>
          <p className="text-base font-semibold tabular-nums truncate">{formatEur(totalMonthly)}</p>
        </div>
        <div className="min-w-0 pl-2 border-l-2" style={{ borderColor: "color-mix(in srgb, var(--foreground) 20%, transparent)" }}>
          <p className="text-sm text-foreground/60 truncate">Last goal by</p>
          <p className="text-base font-semibold tabular-nums truncate">{latestTargetLabel ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}

import { SplitEur } from "@/components/split-eur";
import { formatEur } from "@/lib/format";

// The two condensed stat cards shown when the "All" pill is selected — quick totals
// distilled from the fuller My Income / My savings goals cards shown under their
// respective filters.
export function SummaryMiniCards({ income, totalSaved }: { income: number; totalSaved: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl bg-card p-4">
        <p className="text-sm text-foreground/60 mb-1">Income this month</p>
        <p className="text-2xl font-semibold tabular-nums tracking-tight">
          <SplitEur formatted={formatEur(income)} />
        </p>
      </div>
      <div className="rounded-2xl bg-card p-4">
        <p className="text-sm text-foreground/60 mb-1">Total saved</p>
        <p className="text-2xl font-semibold tabular-nums tracking-tight">
          <SplitEur formatted={formatEur(totalSaved)} />
        </p>
      </div>
    </div>
  );
}

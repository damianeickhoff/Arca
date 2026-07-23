import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ComputedDebt } from "./debt-shared";

// The "Verdeling" (distribution) card — segmented bar + legend showing each debt's
// share of the total outstanding balance. Shared by mobile/desktop; only the legend
// grid and heading size differ between the two, via className overrides.
export function DebtDistributionBar({
  computed,
  totalDebt,
  titleClassName,
  legendClassName,
}: {
  computed: ComputedDebt[];
  totalDebt: number;
  titleClassName?: string;
  legendClassName?: string;
}) {
  if (totalDebt <= 0) return null;
  const withBalance = computed.filter((c) => c.currentBalance > 0);

  return (
    <div className="rounded-2xl bg-card p-5 space-y-4">
      <h2 className={cn("font-semibold", titleClassName ?? "text-base")}>Verdeling</h2>
      <div className="h-4 rounded-full overflow-hidden flex gap-0.5 bg-foreground/5">
        {withBalance.map(({ debt, currentBalance }) => (
          <div
            key={debt.id}
            className="rounded-full"
            style={{ width: `${(currentBalance / totalDebt) * 100}%`, backgroundColor: debt.color ?? "var(--chart-3)" }}
            title={`${debt.name}: ${formatEur(currentBalance)}`}
          />
        ))}
      </div>
      <div className={cn("flex flex-col gap-2.5", legendClassName)}>
        {withBalance.map(({ debt, currentBalance }) => (
          <div key={debt.id} className="flex items-center gap-2.5 min-w-0">
            <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: debt.color ?? "var(--chart-3)" }} />
            <span className="text-sm font-medium truncate">{debt.name}</span>
            <span className="text-sm font-semibold tabular-nums shrink-0 ml-auto">{formatEur(currentBalance)}</span>
            <span className="text-sm text-foreground/60 tabular-nums shrink-0 w-12 text-right">{Math.round((currentBalance / totalDebt) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

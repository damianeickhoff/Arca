import { DebtPayoffChart } from "@/components/dashboard-charts";
import { cn } from "@/lib/utils";
import type { ComputedDebt, DebtChartRow, DebtChartSeries } from "./debt-shared";

// The payoff-projection chart card — shared by mobile/desktop; title casing/weight
// and the "Total" swatch color differ per breakpoint (carried over verbatim from
// the pre-refactor markup rather than unified, to avoid changing existing behavior).
export function DebtPayoffTimelineCard({
  chartData,
  chartSeries,
  computed,
  title,
  titleClassName,
  totalColor,
  legendClassName,
}: {
  chartData: DebtChartRow[];
  chartSeries: DebtChartSeries[];
  computed: ComputedDebt[];
  title: string;
  titleClassName?: string;
  totalColor: string;
  legendClassName?: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-5 space-y-1">
      <h2 className={titleClassName ?? "font-semibold text-sm"}>{title}</h2>
      <p className="text-xs text-foreground/60 mb-3">Expected payoff based on minimum payments</p>
      <DebtPayoffChart data={chartData} series={chartSeries} />
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
        <div className={cn("flex items-center gap-1.5", legendClassName ?? "text-sm text-foreground/60")}>
          <span className="inline-block w-5 border-t-2" style={{ borderColor: totalColor }} />
          Total
        </div>
        {computed.map(({ debt }) => (
          <div key={debt.id} className={cn("flex items-center gap-1.5", legendClassName ?? "text-sm text-foreground/60")}>
            <span className="inline-block w-5 border-t border-dashed" style={{ borderColor: debt.color ?? "var(--chart-3)" }} />
            {debt.name}
          </div>
        ))}
      </div>
    </div>
  );
}

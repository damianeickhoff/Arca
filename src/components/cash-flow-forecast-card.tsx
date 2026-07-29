"use client";

import { IconTrendingUp, IconTrendingDown, IconAlertTriangleFilled } from "@tabler/icons-react";
import { signedForecastEur, type ForecastStatus } from "@/lib/cash-flow-forecast-shared";
import { useReportsPortal } from "@/lib/reports-portal-state";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<ForecastStatus, { color: string; icon: typeof IconTrendingUp }> = {
  healthy: { color: "var(--color-success)", icon: IconTrendingUp },
  warning: { color: "var(--color-warning)", icon: IconAlertTriangleFilled },
  critical: { color: "var(--color-danger)", icon: IconTrendingDown },
};

/**
 * Compact dashboard card — headline figure plus the single most important thing about
 * the forecast horizon. Deliberately has no period selector or progress bar: the
 * indicator area is the forecast insight instead. Tapping it opens the Analytics
 * portal straight onto its Forecast tab, where the full charts live.
 *
 * When no account has a starting balance the figure is cumulative projected cash flow,
 * not a balance, and the label says so (see cash-flow-forecast.ts).
 */
export function CashFlowForecastCard({
  current,
  status,
  message,
  hasStartingBalance,
  className,
}: {
  current: number;
  status: ForecastStatus;
  message: string;
  hasStartingBalance: boolean;
  className?: string;
}) {
  const { openReports } = useReportsPortal();
  const { color, icon: StatusIcon } = STATUS_STYLES[status];

  return (
    <button
      type="button"
      onClick={() => openReports("prognose")}
      className={cn(
        "flex flex-col justify-center gap-1 mx-3 mt-5 rounded-2xl bg-card p-4 text-left active:scale-[0.98] transition-transform duration-150 w-[calc(100%-1.5rem)]",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="size-6 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)` }}
        >
          <StatusIcon className="size-3.5" style={{ color }} />
        </span>
        <p className="text-sm font-semibold text-foreground truncate">Cash Flow Forecast</p>
      </div>

      <p className="text-2xl font-black tabular-nums tracking-tight text-foreground">
        {signedForecastEur(current)}
      </p>

      {!hasStartingBalance && (
        <p className="text-xs text-foreground/40 -mt-0.5">Projected cash flow — no account balance set</p>
      )}

      <p className="text-sm text-foreground/50 leading-snug line-clamp-2" style={status === "healthy" ? undefined : { color }}>
        {message}
      </p>
    </button>
  );
}

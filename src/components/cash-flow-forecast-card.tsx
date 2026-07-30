"use client";

import { signedForecastEur, type ForecastStatus } from "@/lib/cash-flow-forecast-shared";
import { useReportsPortal } from "@/lib/reports-portal-state";
import { DASH_CARD_TITLE, DASH_CARD_BODY, DASH_CARD_SUBTITLE, DashCardPill } from "@/components/dashboard-card";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

// Colour only — the status is carried by the pill next to the title rather than by an
// icon chip or by tinting the message text (the subtitle slot is a fixed neutral grey
// in every card in the row).
const STATUS_COLORS: Record<ForecastStatus, string> = {
  healthy: "var(--color-success)",
  warning: "var(--color-warning)",
  critical: "var(--color-danger)",
  // "empty" carries no verdict, so it gets the same muted grey the other cards use
  // for their "not enough data" pill rather than a traffic-light colour.
  empty: "var(--color-muted-foreground)",
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
  const color = STATUS_COLORS[status];
  const t = useTranslations("cashFlow");


  return (
    <button
      type="button"
      onClick={() => openReports("prognose")}
      className={cn(
        "flex flex-col gap-1 mx-3 mt-5 rounded-2xl bg-card p-4 text-left active:scale-[0.98] transition-transform duration-150 w-[calc(100%-1.5rem)]",
        className,
      )}
    >
      {/* items-start, not items-center: the title wraps to two or three lines in some
          languages and the pill must stay pinned to the card's top-right corner. */}
      <div className="flex items-start justify-between gap-2">
        <p className={DASH_CARD_TITLE}>{t("title")}</p>
        <DashCardPill label={t(`status.${status}`)} color={color} />
      </div>

      <div className={cn(DASH_CARD_BODY, "gap-1")}>
        <p className="text-xl font-black tabular-nums tracking-tight text-foreground">
          {signedForecastEur(current)}
        </p>

        {!hasStartingBalance && (
          <p className="text-[11px] text-foreground/40 -mt-0.5">{t("emptySub")}</p>
        )}
      </div>

      <p className={DASH_CARD_SUBTITLE}>{message}</p>
    </button>
  );
}

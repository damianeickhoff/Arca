"use client";

import { useReportsPortal } from "@/lib/reports-portal-state";
import type { HealthCategoryKey, HealthStateKey } from "@/lib/financial-health";
import { DASH_CARD_TITLE, DASH_CARD_BODY, DASH_CARD_SUBTITLE, DashCardPill } from "@/components/dashboard-card";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * Compact dashboard card in the horizontal card row: the score out of 100, a bar
 * showing it, and the one thing that would improve it most.
 *
 * The state is carried solely by the tinted pill beside the title — scannable while
 * flicking through the row, and it leaves the card's one supporting line free for
 * the thing the user can act on. With nothing scorable the pill reads "Data needed"
 * and the supporting line says what's missing. Tapping opens the Insights portal on
 * its Health tab, the same way CashFlowForecastCard opens it on Forecast.
 *
 * Renders in its "not enough data" form rather than disappearing when nothing can
 * be scored yet, so the entry point to the Health page is always there.
 */
export function FinancialHealthCard({
  score,
  stateKey,
  color,
  topOpportunity,
  className,
}: {
  score: number | null;
  stateKey: HealthStateKey | null;
  color: string | null;
  topOpportunity: HealthCategoryKey | null;
  className?: string;
}) {
  const { openReports } = useReportsPortal();
  const t = useTranslations("financialHealth");
  const accent = color ?? "var(--color-warning)";

  return (
    <button
      type="button"
      onClick={() => openReports("health")}
      data-tip-anchor="healthCard"
      className={cn(
        "flex flex-col gap-2 mx-3 mt-5 rounded-2xl bg-card p-4 text-left active:scale-[0.98] transition-transform duration-150 w-[calc(100%-1.5rem)]",
        className,
      )}
    >
      {/* items-start, not items-center: the title wraps to two or three lines in some
          languages and the pill must stay pinned to the card's top-right corner. */}
      <div className="flex items-start justify-between gap-2">
        <p className={DASH_CARD_TITLE}>{t("title")}</p>
        <DashCardPill label={stateKey ? t(`state.${stateKey}`) : t("dataNeeded")} color={accent} />
      </div>

      <div className={cn(DASH_CARD_BODY, "gap-2")}>
        {score === null ? (
          <p className="text-xl font-black tracking-tight text-foreground/40">—</p>
        ) : (
          <p className="text-xl font-black tabular-nums tracking-tight text-foreground">
            {score} <span className="text-sm font-bold text-foreground/40">/ 100</span>
          </p>
        )}

        <div className="h-2 rounded-full bg-foreground/10 overflow-hidden">
          {score !== null && (
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${Math.max(2, score)}%`, backgroundColor: accent }}
            />
          )}
        </div>
      </div>

      {/* Subtitle slot — the single highest-impact category, phrased as the next thing
          to look at. Falls back when there is nothing to rank: at a perfect score
          (nothing left to improve) and when nothing is scorable yet. */}
      <p className={DASH_CARD_SUBTITLE}>
        {topOpportunity
          ? t("opportunity", { area: t(`category.${topOpportunity}`) })
          : score === null
            ? t("subtitleEmpty")
            : t("subtitlePerfect")}
      </p>
    </button>
  );
}

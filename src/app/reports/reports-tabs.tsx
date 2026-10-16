"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ContextualTip } from "@/components/contextual-tip";
import { Segmented } from "@/components/clear/segmented";

// Insights' five tabs. The ids are the existing ?tab= values (kept so old links and
// the shared date cookies keep working); only the labels are new.
export const INSIGHTS_TABS = ["rapporten", "trends", "vermogen", "prognose", "health"] as const;
export type InsightsTab = (typeof INSIGHTS_TABS)[number];

export const INSIGHTS_TAB_LABEL_KEY: Record<InsightsTab, string> = {
  rapporten: "overview",
  trends: "trends",
  vermogen: "netWorth",
  prognose: "forecast",
  health: "health",
};

export function ReportsTabs({ active }: { active: string }) {
  const t = useTranslations("insights.tabs");
  const tInsights = useTranslations("insights");
  const pathname = usePathname();

  return (
    <>
      {/* The Clear segmented control (links). Scrolls sideways on the narrowest phones
          rather than squeezing five labels. */}
      <nav aria-label={tInsights("title")} className="-mx-4 overflow-x-auto px-4 scrollbar-hide lg:mx-0 lg:px-0">
        <Segmented
          label={tInsights("title")}
          value={active}
          items={INSIGHTS_TABS.map((id) => ({ value: id, label: t(INSIGHTS_TAB_LABEL_KEY[id]), href: `${pathname}?tab=${id}` }))}
          className="shrink-0 [&>a]:shrink-0 [&>a]:whitespace-nowrap"
        />
      </nav>

      {/* The feature tips that used to fire inside the Insights portal, now on the page. */}
      <ContextualTip id="reports" active={active === "rapporten" || active === "trends" || active === "vermogen"} />
      <ContextualTip id="forecast" active={active === "prognose"} />
      <ContextualTip id="health" active={active === "health"} />
    </>
  );
}

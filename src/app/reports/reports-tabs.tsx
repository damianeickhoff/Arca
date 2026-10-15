"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ContextualTip } from "@/components/contextual-tip";
import { cn } from "@/lib/utils";

// Insights' five tabs. The ids are the existing ?tab= values (kept so old links and
// the shared date cookies keep working); only the labels are new.
export const INSIGHTS_TABS = ["rapporten", "trends", "vermogen", "prognose", "health"] as const;
export type InsightsTab = (typeof INSIGHTS_TABS)[number];

const LABEL_KEY: Record<InsightsTab, string> = {
  rapporten: "overview",
  trends: "trends",
  vermogen: "netWorth",
  prognose: "forecast",
  health: "health",
};

export function ReportsTabs({ active }: { active: string }) {
  const t = useTranslations("insights.tabs");
  const pathname = usePathname();

  return (
    <>
      {/* V5: a row of chips. Scrolls sideways on the narrowest phones rather than
          squeezing five labels. */}
      <div className="-mx-5 overflow-x-auto px-5 scrollbar-hide lg:mx-0 lg:px-0">
        <div role="tablist" className="inline-flex gap-2">
          {INSIGHTS_TABS.map((id) => {
            const isActive = active === id;
            return (
              <Link
                key={id}
                role="tab"
                aria-selected={isActive}
                href={`${pathname}?tab=${id}`}
                scroll={false}
                className={cn(
                  "inline-flex h-[34px] shrink-0 items-center whitespace-nowrap rounded-full border px-[13px] text-[13px] font-semibold transition-colors",
                  isActive ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {t(LABEL_KEY[id])}
              </Link>
            );
          })}
        </div>
      </div>

      {/* The feature tips that used to fire inside the Insights portal, now on the page. */}
      <ContextualTip id="reports" active={active === "rapporten" || active === "trends" || active === "vermogen"} />
      <ContextualTip id="forecast" active={active === "prognose"} />
      <ContextualTip id="health" active={active === "health"} />
    </>
  );
}

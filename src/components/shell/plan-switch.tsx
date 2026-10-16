"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnchoredTip } from "@/components/anchored-tip";
import { Segmented } from "@/components/clear/segmented";
import { PLAN_ITEMS, activePlanKey } from "@/components/shell/nav-config";

/**
 * The Plan hub's segmented switch — Budget | Debts | Goals — shown at the top of each
 * of the three Plan pages. They stay separate routes; the switch is what makes them
 * read as one place.
 */
export function PlanSwitch({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const active = activePlanKey(pathname);

  return (
    <>
      <nav aria-label={t("plan")} data-tip-anchor="planSwitch" className={className}>
        <Segmented
          label={t("plan")}
          value={active ?? ""}
          items={PLAN_ITEMS.map((item) => ({ value: item.key, label: t(`planItems.${item.key}`), href: item.href }))}
        />
      </nav>
      <AnchoredTip id="planHub" anchor="planSwitch" />
    </>
  );
}

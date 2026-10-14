"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnchoredTip } from "@/components/anchored-tip";
import { PLAN_ITEMS, activePlanKey } from "@/components/shell/nav-config";
import { cn } from "@/lib/utils";

/**
 * The Plan hub's segmented switch — Budget | Debts | Goals — shown at the top of each
 * of the three Plan pages. They stay separate routes; the switch is what makes them
 * read as one place, and the desktop sidebar mirrors it as the Plan sub-menu.
 */
export function PlanSwitch({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const active = activePlanKey(pathname);

  return (
    <>
      <nav
        aria-label={t("plan")}
        data-tip-anchor="planSwitch"
        className={cn("inline-flex gap-0.5 rounded-full bg-surface-2 p-[3px]", className)}
      >
        {PLAN_ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors",
                isActive ? "bg-ink text-bg" : "text-ink-2 hover:text-ink",
              )}
            >
              {t(`planItems.${item.key}`)}
            </Link>
          );
        })}
      </nav>
      <AnchoredTip id="planHub" anchor="planSwitch" />
    </>
  );
}

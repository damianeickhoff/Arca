"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Budget | Forecast on the standalone /forecast route.
const TABS = [
  { id: "budget",   href: "/budget" },
  { id: "prognose", href: "/forecast" },
] as const;

export function BudgetTabs() {
  const t = useTranslations("insights.budgetTabs");
  const pathname = usePathname();
  const router = useRouter();
  const active = TABS.find((tab) => pathname === tab.href)?.id ?? "budget";

  return (
    <div className="inline-flex gap-0.5 rounded-full bg-surface-2 p-[3px]">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => router.push(tab.href)}
          className={cn(
            "inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors",
            active === tab.id ? "bg-ink text-bg" : "text-ink-2 hover:text-ink",
          )}
        >
          {t(tab.id)}
        </button>
      ))}
    </div>
  );
}

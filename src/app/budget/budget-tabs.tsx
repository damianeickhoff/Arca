"use client";

import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "budget",   label: "Budget",   href: "/budget" },
  { id: "prognose", label: "Forecast", href: "/forecast" },
];

export function BudgetTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const active = TABS.find((t) => pathname === t.href)?.id ?? "budget";

  return (
    <div className="flex gap-1 p-1 rounded-xl bg-foreground/[0.05]">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => router.push(tab.href)}
          className={cn(
            "flex-1 text-sm font-medium py-1.5 rounded-lg transition-all",
            active === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-foreground/50 hover:text-foreground/70",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

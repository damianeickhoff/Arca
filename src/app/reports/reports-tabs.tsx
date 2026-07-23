"use client";

import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "rapporten", label: "Analytics" },
  { id: "trends",    label: "Trends" },
  { id: "vermogen",  label: "Net worth" },
];

export function ReportsTabs({ active }: { active: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex gap-1 p-1 rounded-xl">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => router.push(`${pathname}?tab=${tab.id}`)}
          className={cn(
            "flex-1 text-sm font-medium py-1.5 rounded-lg transition-all",
            active === tab.id
              ? "text-foreground shadow-sm"
              : "text-foreground/50 hover:text-foreground/70",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

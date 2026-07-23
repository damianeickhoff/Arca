import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Extracted from the budget page's duplicated red/amber alert blocks — server-safe
// (no client state), so it can be dropped into any server component.
export function WarningBanner({
  severity,
  children,
}: {
  severity: "danger" | "warning";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-2.5 text-sm flex items-center gap-2",
        severity === "danger"
          ? "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-900/10 text-red-700 dark:text-red-400"
          : "border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400",
      )}
    >
      {children}
    </div>
  );
}

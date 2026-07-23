import { cn } from "@/lib/utils";

/**
 * Single source of truth for the rounded "filter chip" trigger look shared by every filter
 * button across the app (transactions page's date/type/category filters, the budget page's
 * month picker, etc.) — change the look here once instead of re-hardcoding it per component.
 */
export function filterPillClass(active: boolean, className?: string) {
  return cn(
    "flex items-center justify-between gap-1.5 text-md  backdrop-blur-lg rounded-full pl-3 pr-3 py-2.5 cursor-pointer transition-colors",
    active ? "bg-foreground text-background" : "bg-[var(--dialog-content-background)] dark:bg-white/7 text-foreground",
    className,
  );
}

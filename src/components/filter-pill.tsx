import { cn } from "@/lib/utils";

/**
 * Single source of truth for the "filter chip" trigger look shared by every filter
 * button across the app (the Activity chips, the budget page's month picker, the
 * Insights filters, …) — change the look here once instead of re-hardcoding it per
 * component.
 *
 * Clear chip: a 44px (48px from lg) white pill on the grey ground, bold label; an active
 * chip turns black (the primary colour) with light text.
 */
export function filterPillClass(active: boolean, className?: string) {
  return cn(
    "inline-flex h-11 items-center justify-between gap-2 whitespace-nowrap rounded-full px-4 font-clear text-sm font-bold cursor-pointer transition-colors lg:h-12 lg:px-[18px] lg:text-[15px] [&_svg]:size-4",
    // Inside a white sheet or card (data-surface="card" on an ancestor) the idle chip is grey.
    active ? "bg-clear-primary text-clear-primary-ink" : "bg-clear-card text-clear-ink hover:bg-clear-tile in-data-[surface=card]:bg-clear-tile",
    className,
  );
}

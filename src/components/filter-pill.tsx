import { cn } from "@/lib/utils";

/**
 * Single source of truth for the "filter chip" trigger look shared by every filter
 * button across the app (the Activity chips, the budget page's month picker, the
 * Insights filters, …) — change the look here once instead of re-hardcoding it per
 * component.
 *
 * Mustard chip: a 34px pill on surface with a line border; an active chip inverts to
 * ink with background-coloured text.
 */
export function filterPillClass(active: boolean, className?: string) {
  return cn(
    "inline-flex h-[34px] items-center justify-between gap-1.5 whitespace-nowrap rounded-full border px-[13px] text-[13px] font-semibold cursor-pointer transition-colors",
    active ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink-2 hover:text-ink",
    className,
  );
}

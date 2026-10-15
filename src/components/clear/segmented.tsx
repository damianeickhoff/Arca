"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

export interface SegmentedItem<T extends string> {
  value: T;
  label: React.ReactNode;
  /** When set, the item is a link (page-level switches like Budget · Debts · Goals). */
  href?: string;
}

/**
 * The Clear segmented control: a white pill holding pill options, the active one
 * black. Links when the items carry an href (then it's navigation, marked with
 * aria-current); otherwise radio-like buttons driven by value/onChange.
 * `surface="tile"` puts it on a card (grey container) instead of the page ground.
 */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
  surface = "card",
  size = "md",
  className,
}: {
  items: SegmentedItem<T>[];
  value: T;
  onChange?: (value: T) => void;
  /** Accessible name for the group, already translated. */
  label: string;
  surface?: "card" | "tile";
  size?: "sm" | "md";
  className?: string;
}) {
  const container = surface === "card" ? "bg-clear-card" : "bg-clear-tile";
  const item = cn(
    "inline-flex items-center justify-center rounded-full px-[18px] font-clear text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50",
    size === "sm" ? "h-8 px-3.5 text-[13px]" : "h-10",
  );
  const on = "bg-clear-primary font-bold text-clear-primary-ink";
  const off = "font-semibold text-clear-ink-2 hover:text-clear-ink";

  const isNav = items.some((i) => i.href);

  return (
    <div
      role={isNav ? undefined : "radiogroup"}
      aria-label={label}
      className={cn("inline-flex gap-1 rounded-full p-[5px]", container, className)}
    >
      {items.map((i) =>
        i.href ? (
          <Link key={i.value} href={i.href} aria-current={i.value === value ? "page" : undefined} className={cn(item, i.value === value ? on : off)}>
            {i.label}
          </Link>
        ) : (
          <button
            key={i.value}
            type="button"
            role="radio"
            aria-checked={i.value === value}
            onClick={() => onChange?.(i.value)}
            className={cn(item, "cursor-pointer", i.value === value ? on : off)}
          >
            {i.label}
          </button>
        ),
      )}
    </div>
  );
}

"use client";

import { IconSearch, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { m, spring, AnimatePresence } from "@/lib/motion";
import { SHEET_COLUMN } from "@/components/page-container";

// Where anything that docks to the bottom of the screen sits: full-bleed with
// 1.5rem gutters on a phone, capped to the shared content column and centred on
// desktop. Moved here from the old bottom nav, which the app shell's tab bar replaced.
export const bottomDockClass = cn(SHEET_COLUMN, "fixed inset-x-0 bottom-5 px-6");

// For a bar that stays up while the phone tab bar is showing (the Insights period
// pickers): stacked 12px above the 68px tab bar (itself 20px off the bottom) instead
// of on top of it. From lg there is no tab bar, so it drops back to the bottom.
export const aboveNavDockClass = cn(
  SHEET_COLUMN,
  "fixed inset-x-0 px-6 bottom-[calc(100px+var(--sab))] lg:bottom-5",
);

// The floating pill the global search overlay's field sits in.
export const pillContainerClass = cn(
  "relative flex items-center overflow-hidden rounded-full border border-clear-line bg-clear-card p-[4px] shadow-clear-float transition-all duration-300 ease-in-out",
);

/** The search glyph that turns into a close X while search is open. */
export function SearchCloseIcon({ open, size }: { open: boolean; size: number }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <m.span
        key={open ? "close" : "search"}
        initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
        transition={spring.snappy}
        className="flex items-center justify-center"
      >
        {open ? <IconX size={size} stroke={1.5} /> : <IconSearch size={size} stroke={1.5} />}
      </m.span>
    </AnimatePresence>
  );
}

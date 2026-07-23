"use client";

import { useState } from "react";
import { IconChevronDownFilled as ChevronDown } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// The real category grouping items within a TypeSection (e.g. which "Recurring
// bills" belong to "Rent") — its own collapsible card, same pattern as TypeSection
// and CategoryCard, collapsed by default. No color dot, matching TypeSection's plain
// label-only header.
export function CategoryGroup({ name, children }: { name: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-[var(--dialog-background)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full px-4 py-3"
      >
        <p className="text-xs font-medium text-foreground/50">{name}</p>
        <ChevronDown className={cn("size-3.5 text-foreground/40 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-4 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

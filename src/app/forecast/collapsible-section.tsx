"use client";

import { useState } from "react";
import { IconChevronDownFilled as ChevronDown } from "@tabler/icons-react";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";

// Top-level collapsible block — e.g. "Categories" vs "Recurring items" on the
// Prognose tab. Defaults open so nothing hides on first load; the chevron toggles it.
export function CollapsibleSection({
  title, total, color, defaultOpen = false, children,
}: {
  title: string;
  total?: number;
  color?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full rounded-xl px-1 bg-card p-5 px-5"
      >
        <div className="flex items-center gap-2">
          {color && <span className="w-4 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
          <h2 className="font-semibold text-sm">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <ChevronDown className={cn("size-4 text-foreground/60 transition-transform", open && "rotate-180")} />
        </div>
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { IconChevronDownFilled as ChevronDown } from "@tabler/icons-react";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";

// Top-level collapsible block — e.g. "Categories" vs "Recurring items" on the
// Prognose tab. Defaults open so nothing hides on first load; the chevron toggles it.
export function CollapsibleSection({
  title, total, color, defaultOpen = false, id, children,
}: {
  title: string;
  /** An anchor id, so another card can link down to this section. */
  id?: string;
  total?: number;
  color?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className="scroll-mt-24 overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-[18px] py-4 lg:px-5"
      >
        <div className="flex items-center gap-2">
          {color && <span className="w-4 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
          <h2 className="heading text-[17px] text-ink">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <ChevronDown className={cn("size-4 text-ink-3 transition-transform", open && "rotate-180")} />
        </div>
      </button>
      {open && <div className="px-[18px] pb-[18px] lg:px-5">{children}</div>}
    </section>
  );
}

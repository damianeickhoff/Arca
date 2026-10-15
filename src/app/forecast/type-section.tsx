"use client";

import { useState } from "react";
import { IconChevronDownFilled as ChevronDown } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// One recurring-item type (Income, Recurring bills, Subscriptions, Debts, Savings) —
// same single-card shape as CategoryCard (header + content sharing one rounded box),
// collapsed by default so the "Recurring items" section doesn't dump every item on
// first load. No color/amount on the header — just the label, matching the plain
// CategoryGroup cards nested inside.
export function TypeSection({
  title, children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-row bg-surface-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3.5"
      >
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <ChevronDown className={cn("size-4 text-ink-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </div>
  );
}

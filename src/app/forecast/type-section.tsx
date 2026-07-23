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
    <div className="rounded-2xl bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full px-5 py-4"
      >
        <h2 className="font-semibold text-sm">{title}</h2>
        <ChevronDown className={cn("size-4 text-foreground/60 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-5 pb-5 space-y-2">{children}</div>}
    </div>
  );
}

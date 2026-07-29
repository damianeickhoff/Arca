"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconChevronDownFilled as ChevronDown,
  IconCalendarMonth as CalendarMonth,
  IconCheck as Check,
} from "@tabler/icons-react";
import { MONTH_NAMES } from "@/lib/format";
import { cn } from "@/lib/utils";
import { glassIconButton } from "@/lib/styles";
import { filterPillClass } from "@/components/filter-pill";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function MonthPicker({
  current,
  variant = "pill",
  paramName = "month",
}: {
  current: string;
  variant?: "pill" | "icon";
  /** URL search param this picker reads/writes — defaults to "month". Lets two
   * instances coexist on the same page (e.g. the Month comparison's cmpA/cmpB),
   * each merged into the existing query string instead of overwriting it. */
  paramName?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const months: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ value, label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` });
  }

  const currentLabel = months.find((m) => m.value === current)?.label ?? current;

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, value);
    router.push(`?${params.toString()}`);
    setOpen(false);
  }

  return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={variant === "icon" ? currentLabel : undefined}
          className={variant === "icon" ? cn("size-12", glassIconButton) : filterPillClass(false, "pr-3")}
        >
          {variant === "icon" ? (
            <CalendarMonth className="size-7 text-foreground dark:text-gray-300" />
          ) : (
            <>
              <span className="truncate">{currentLabel}</span>
              <ChevronDown className="size-4.5 shrink-0" />
            </>
          )}
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Choose month</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-1 -mx-1">
              {[...months].reverse().map((m) => {
                const active = m.value === current;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => onChange(m.value)}
                    className={cn(
                      "flex items-center justify-between rounded-xl px-4 py-3.5 text-sm transition-colors",
                      active ? "bg-foreground text-primary-foreground font-medium" : "hover:bg-foreground/5 text-foreground",
                    )}
                  >
                    <span>{m.label}</span>
                    {active && <Check className="size-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </>
  );
}

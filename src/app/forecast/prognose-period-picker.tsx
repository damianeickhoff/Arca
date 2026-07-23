"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconChevronLeft, IconChevronRight, IconCheck as Check } from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MONTH_NAMES } from "@/lib/format";
import { cn } from "@/lib/utils";

// Same floating bottom-bar style as PeriodSelector (src/app/reports/period-selector.tsx)
// — prev/next chevrons around a center pill that opens a dialog list — but behaves like
// MonthPicker (src/components/month-picker.tsx): picks a single month, restricted to
// last month, current month, and the next 6 months (8 total), "today"-anchored.
export function PrognosePeriodPicker({ current }: { current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const months: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = -1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ value, label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` });
  }

  const index = months.findIndex((m) => m.value === current);
  const currentLabel = index >= 0 ? months[index].label : current;

  function navigate(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", value);
    router.push(`?${params.toString()}`);
  }

  function step(direction: 1 | -1) {
    const next = index + direction;
    if (next < 0 || next >= months.length) return;
    navigate(months[next].value);
  }

  return (
    <>
      {/* Fixed at the same position + height as the mobile bottom nav, same
          convention as PeriodSelector. */}
      <div className="lg:hidden fixed left-6 right-6 bottom-5 z-40 h-[3.75rem] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={index <= 0}
          aria-label="Previous month"
          className="h-full aspect-square rounded-full bg-black/7 dark:bg-white/7 backdrop-blur-lg flex items-center justify-center active:scale-95 transition-transform shrink-0 disabled:cursor-not-allowed"
        >
          <IconChevronLeft className={cn("size-4", index <= 0 && "opacity-30")} />
        </button>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-1 min-w-0 h-full rounded-full bg-black/7 dark:bg-white/7 backdrop-blur-lg px-4 flex flex-col items-center justify-center active:scale-[0.98] transition-transform"
        >
          <p className="text-[11px] leading-tight text-foreground/50">Month</p>
          <p className="text-sm font-semibold leading-tight truncate">{currentLabel}</p>
        </button>

        <button
          type="button"
          onClick={() => step(1)}
          disabled={index < 0 || index >= months.length - 1}
          aria-label="Next month"
          className="h-full aspect-square rounded-full bg-black/7 dark:bg-white/7 backdrop-blur-lg flex items-center justify-center active:scale-95 transition-transform shrink-0 disabled:cursor-not-allowed"
        >
          <IconChevronRight className={cn("size-4", index < 0 || index >= months.length - 1 && "opacity-30")} />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose month</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1 -mx-1">
            {months.map((m) => {
              const active = m.value === current;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => { navigate(m.value); setOpen(false); }}
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

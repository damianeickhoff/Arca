"use client";

import { useEffect, useMemo, useState } from "react";
import { IconCheck as Check, IconSearch as Search } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RecurringItem } from "@/db/schema";

// Multi-select sheet for the recurring bills that pay a debt off — same staged-selection
// pattern as CategoryMultiPicker/AccountMultiPicker (selection only commits when the
// header checkmark is tapped).
export function RecurringMultiPicker({
  bills,
  selected,
  open,
  onOpenChange,
  onApply,
}: {
  bills: RecurringItem[];
  selected: number[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (ids: number[]) => void;
}) {
  const [staged, setStaged] = useState<number[]>(selected);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setStaged(selected);
    setSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () => bills.filter((b) => !query || b.name.toLowerCase().includes(query)),
    [bills, query],
  );

  function toggle(id: number) {
    setStaged((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  const allIds = bills.map((b) => b.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => staged.includes(id));
  function toggleAll() {
    setStaged(allSelected ? [] : allIds);
  }

  function confirm() {
    onApply(staged);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        fullHeight
        hideHandle
        title="Linked recurring bills"
        headerAction={
          <button
            type="button"
            onClick={confirm}
            aria-label="Confirm"
            className="size-11 rounded-full bg-foreground text-background flex items-center justify-center"
          >
            <Check className="size-5" />
          </button>
        }
        footer={
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-foreground/40 pointer-events-none" />
              <input
                type="text"
                placeholder="Search recurring bill"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-11 text-sm rounded-full pl-10 pr-4 bg-black/7 dark:bg-white/7 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={toggleAll}
              className="shrink-0 h-11 rounded-full bg-foreground/5 px-4 text-sm font-semibold text-foreground"
            >
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-1.5">
          {filtered.map((bill) => {
            const active = staged.includes(bill.id);
            return (
              <button
                key={bill.id}
                type="button"
                onClick={() => toggle(bill.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors w-full",
                  active ? "bg-card" : "hover:bg-card",
                )}
              >
                <Icon iconKey={bill.icon} color={bill.iconColor} round size="sm" />
                <span className="flex-1 min-w-0 text-sm truncate">{bill.name}</span>
                {bill.amount != null && (
                  <span className="text-xs text-foreground/50 tabular-nums shrink-0">{formatEur(bill.amount)}</span>
                )}
                <span
                  className={cn(
                    "size-6 rounded-md border flex items-center justify-center shrink-0",
                    active ? "bg-primary border-primary text-primary-foreground" : "border-foreground/25",
                  )}
                >
                  {active && <Check className="size-4" />}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-foreground/40 text-center py-6">
              {bills.length === 0 ? "No recurring bills yet." : "No recurring bills found"}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

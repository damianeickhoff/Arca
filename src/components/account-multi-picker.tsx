"use client";

import { useEffect, useState } from "react";
import { IconCheck as Check } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Bank } from "@/db/schema";

// Multi-select account sheet — same checkbox-row / header-confirm pattern as
// CategoryMultiPicker, but a flat list (accounts have no grouping).
export function AccountMultiPicker({
  banks,
  selected,
  open,
  onOpenChange,
  onApply,
}: {
  banks: Bank[];
  selected: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (accountNumbers: string[]) => void;
}) {
  const [staged, setStaged] = useState<string[]>(selected);

  useEffect(() => {
    if (!open) return;
    setStaged(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggle(accountNumber: string) {
    setStaged((prev) => (prev.includes(accountNumber) ? prev.filter((v) => v !== accountNumber) : [...prev, accountNumber]));
  }

  const allIds = banks.map((b) => b.accountNumber).filter((v): v is string => !!v);
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
        title="Select Accounts"
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
          <button
            type="button"
            onClick={toggleAll}
            className="w-full h-11 rounded-full bg-foreground/5 text-sm font-semibold text-foreground"
          >
            {allSelected ? "Deselect All" : "Select All"}
          </button>
        }
      >
        <div className="rounded-2xl bg-card divide-y divide-border/50 overflow-hidden">
          {banks.map((bank) => {
            const accountNumber = bank.accountNumber;
            if (!accountNumber) return null;
            const active = staged.includes(accountNumber);
            return (
              <button
                key={bank.id}
                type="button"
                onClick={() => toggle(accountNumber)}
                className="flex items-center gap-3 w-full px-4 py-3.5 text-left"
              >
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{bank.displayName ?? accountNumber}</span>
                  {bank.displayName && (
                    <span className="block text-xs font-mono text-foreground/50 truncate mt-0.5">{accountNumber}</span>
                  )}
                </div>
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
          {banks.length === 0 && <p className="text-sm text-foreground/40 text-center py-6">No accounts</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

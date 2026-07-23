"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Bank } from "@/db/schema";
import {
  IconCashBanknote as BankIcon,
  IconChevronDownFilled as ChevronDown,
  IconCheck as Check,
} from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  banks: Bank[];
  current: string;
  action: (accountNumber: string) => Promise<void>;
};

export function RekeningenButton({ banks, current, action }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function select(value: string) {
    await action(value);
    router.refresh();
    setOpen(false);
  }

  const selectedBank = banks.find((b) => b.accountNumber === current);
  const label = current
    ? (selectedBank?.displayName ?? selectedBank?.accountNumber ?? current)
    : "Alle rekeningen";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-white/10 backdrop-blur-sm text-white/80 text-sm font-medium py-3.5 hover:bg-white/15 transition-colors cursor-pointer"
      >
        <BankIcon className="size-4 text-white/60" stroke={1.5} />
        <span>{label}</span>
        <ChevronDown className="size-3 text-white/50" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rekening kiezen</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1 -mx-1">
            <button
              type="button"
              onClick={() => select("")}
              className={cn(
                "flex items-center justify-between rounded-xl px-4 py-3.5 text-sm transition-colors",
                !current
                  ? "bg-foreground text-primary-foreground font-medium"
                  : "hover:bg-foreground/5 text-foreground",
              )}
            >
              <span>Alle rekeningen</span>
              {!current && <Check className="size-4" />}
            </button>

            {banks.length > 0 && <div className="h-px bg-foreground/10 my-1" />}

            {banks.map((bank) => {
              const active = current === (bank.accountNumber ?? String(bank.id));
              return (
                <button
                  key={bank.id}
                  type="button"
                  onClick={() => select(bank.accountNumber ?? String(bank.id))}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-4 py-3.5 text-sm transition-colors",
                    active
                      ? "bg-foreground text-primary-foreground font-medium"
                      : "hover:bg-foreground/5 text-foreground",
                  )}
                >
                  <div className="flex flex-col items-start min-w-0">
                    <span>{bank.displayName ?? bank.accountNumber ?? `Bank ${bank.id}`}</span>
                    {bank.displayName && bank.accountNumber && (
                      <span
                        className={cn(
                          "text-xs font-mono truncate mt-0.5",
                          active ? "text-primary-foreground/70" : "text-foreground/50",
                        )}
                      >
                        {bank.accountNumber}
                      </span>
                    )}
                  </div>
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

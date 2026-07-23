"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Bank } from "@/db/schema";
import {
  IconChevronDownFilled as ChevronDown,
  IconCashBanknote as BankIcon,
  IconCheck as Check,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { filterPillClass } from "@/components/filter-pill";
import { cn } from "@/lib/utils";
import { glassIconButton } from "@/lib/styles";
import { useIsMobile } from "@/lib/use-is-mobile";

type Props = {
  banks: Bank[];
  current: string;
  mode: "cookie" | "url";
  action?: (accountNumber: string) => Promise<void>;
  variant?: "default" | "card" | "icon";
  className?: string;
  iconClassName?: string;
};

export function BankPicker({ banks, current, mode, action, variant = "default", className, iconClassName }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  async function onChange(value: string) {
    if (mode === "cookie") {
      await action?.(value);
      router.refresh();
    } else {
      const next = new URLSearchParams(params.toString());
      if (value) next.set("account", value);
      else next.delete("account");
      router.push(`?${next.toString()}`);
    }
  }

  const selectedBank = banks.find((b) => b.accountNumber === current);
  const label = current
    ? (selectedBank?.displayName ?? selectedBank?.accountNumber ?? current)
    : "All accounts";

  const isFiltered = !!current;

  const triggerClass = variant === "icon"
    ? cn("size-12", glassIconButton)
    : variant === "card"
    ? `flex items-center gap-1 bg-transparent cursor-pointer hover:opacity-75 transition-opacity ${
        isFiltered
          ? "text-xs font-semibold tracking-widest uppercase text-red-900 dark:text-white"
          : "text-xs font-semibold tracking-widest uppercase dark:text-white"
      }`
    : filterPillClass(false, isFiltered ? "text-foreground" : "text-foreground/60");

  const triggerContent = variant === "icon" ? (
    <BankIcon className={cn("size-7", isFiltered ? "text-primary" : "text-foreground dark:text-gray-300", iconClassName)} stroke={1.5} />
  ) : (
    <>
      {label}
      <ChevronDown className={variant === "card" ? "size-3 opacity-60" : "size-3.5 opacity-60"} />
    </>
  );

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={cn(triggerClass, className)}
        >
          {triggerContent}
        </button>
        <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Choose account</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-1 -mx-1">
              <button
                type="button"
                onClick={() => { onChange(""); setSheetOpen(false); }}
                className={cn(
                  "flex items-center justify-between rounded-xl px-4 py-3.5 text-sm transition-colors",
                  !current ? "bg-foreground text-primary-foreground font-medium" : "hover:bg-foreground/5 text-foreground",
                )}
              >
                <span>All accounts</span>
                {!current && <Check className="size-4" />}
              </button>

              {banks.length > 0 && <div className="h-px bg-foreground/10 my-1" />}

              {banks.map((bank) => {
                const active = current === (bank.accountNumber ?? String(bank.id));
                return (
                  <button
                    key={bank.id}
                    type="button"
                    onClick={() => { onChange(bank.accountNumber ?? String(bank.id)); setSheetOpen(false); }}
                    className={cn(
                      "flex items-center justify-between rounded-xl px-4 py-3.5 text-sm transition-colors",
                      active ? "bg-foreground text-primary-foreground font-medium" : "hover:bg-foreground/5 text-foreground",
                    )}
                  >
                    <div className="flex flex-col items-start min-w-0">
                      <span>{bank.displayName ?? bank.accountNumber ?? `Bank ${bank.id}`}</span>
                      {bank.displayName && bank.accountNumber && (
                        <span className={cn("text-xs font-mono truncate mt-0.5", active ? "text-primary-foreground/70" : "text-foreground/50")}>
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(triggerClass, className)}>
        {triggerContent}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-52 ring-0">
        <DropdownMenuItem
          onClick={() => onChange("")}
          className={!current ? "mt-0 mb-1 bg-foreground text-primary-foreground font-medium focus:bg-foreground focus:text-primary-foreground" : "text-foreground"}
        >
          All accounts
        </DropdownMenuItem>

        {banks.length > 0 && <DropdownMenuSeparator />}

        {banks.map((bank) => {
          const active = current === (bank.accountNumber ?? String(bank.id));
          return (
            <DropdownMenuItem
              key={bank.id}
              onClick={() => onChange(bank.accountNumber ?? String(bank.id))}
              className={active ? "bg-foreground text-primary-foreground font-medium focus:bg-foreground focus:text-primary-foreground" : "text-foreground"}
            >
              <div className="flex flex-col min-w-0">
                <span>{bank.displayName ?? bank.accountNumber ?? `Bank ${bank.id}`}</span>
                {bank.displayName && bank.accountNumber && (
                  <span className={cn("text-xs font-mono truncate", active ? "text-primary-foreground/70" : "text-foreground/60")}>
                    {bank.accountNumber}
                  </span>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconChevronDownFilled as ChevronDown,
  IconXFilled as X,
  IconCheck as Check,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { filterPillClass } from "@/components/filter-pill";
import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "", label: "Alles" },
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
];

export function DirectionPicker({ current, flat = false }: { current?: string; flat?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  function onChange(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("direction", value);
    else next.delete("direction");
    router.push(`?${next.toString()}`);
    setOpen(false);
  }

  const label = OPTIONS.find((o) => o.value === (current ?? ""))?.label ?? "Type";
  const isFiltered = !!current;

  const triggerClass = flat
    ? filterPillClass(isFiltered, "flex-1 min-w-0")
    : "flex items-center gap-2 text-sm font-normal rounded-full pl-3 pr-3 py-2 cursor-pointer text-foreground";

  const triggerContent = (
    <>
      <span className={flat ? "truncate text-left" : "max-w-[100px] truncate"}>{label}</span>
      {flat && isFiltered ? (
        <span
          role="button"
          tabIndex={0}
          aria-label="Clear filter"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onChange(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onChange(""); } }}
          className="shrink-0"
        >
          <X className="size-4.5" />
        </span>
      ) : (
        <ChevronDown className="size-4.5 shrink-0" />
      )}
    </>
  );

  if (isMobile) {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className={triggerClass}>
          {triggerContent}
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Transaction type</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-1 -mx-1">
              {OPTIONS.map((opt) => {
                const active = (current ?? "") === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange(opt.value)}
                    className={cn(
                      "flex items-center justify-between rounded-xl px-4 py-3.5 text-sm transition-colors",
                      active ? "bg-foreground text-primary-foreground font-medium" : "hover:bg-foreground/5 text-foreground",
                    )}
                  >
                    <span>{opt.label}</span>
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
      <DropdownMenuTrigger className={triggerClass}>
        {triggerContent}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40 ring-0 border-none">
        {OPTIONS.map((opt) => {
          const active = (current ?? "") === opt.value;
          return (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={active ? "bg-foreground text-primary-foreground font-medium focus:bg-foreground focus:text-primary-foreground" : "text-foreground"}
            >
              {opt.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

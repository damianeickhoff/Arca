"use client";

import { useState } from "react";
import {
  IconChevronRightFilled as ChevronRight,
  IconCheck as Check,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-is-mobile";

export const FORM_TRIGGER_CLASS = "h-12 w-full rounded-lg text-sm mt-1 flex items-center justify-between gap-2.5 outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-foreground/15 cursor-pointer";

export function OptionDropdown({
  value,
  onChange,
  options,
  triggerClassName,
  disabled,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  triggerClassName?: string;
  disabled?: boolean;
  title?: string;
}) {
  const label = options.find((o) => o.value === value)?.label ?? "Kies…";
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className={cn(FORM_TRIGGER_CLASS, disabled && "opacity-50 cursor-not-allowed", triggerClassName)}
        >
          <span className="truncate">{label}</span>
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            {title && (
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
              </DialogHeader>
            )}
            <div className="flex flex-col gap-1 -mx-1">
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-4 py-3.5 text-sm transition-colors",
                    value === opt.value
                      ? "bg-foreground text-primary-foreground font-medium"
                      : "hover:bg-foreground/5 text-foreground",
                  )}
                >
                  <span>{opt.label}</span>
                  {value === opt.value && <Check className="size-4 shrink-0" />}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(FORM_TRIGGER_CLASS, disabled && "opacity-50 cursor-not-allowed", triggerClassName)}
      >
        <span className="truncate">{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44 max-h-56 overflow-y-auto ring-0 border-none">
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={value === opt.value ? "bg-foreground text-primary-foreground font-medium focus:bg-foreground focus:text-primary-foreground" : "text-foreground"}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface ClearSelectOption<T> {
  value: T;
  label: string;
}

/**
 * A Clear select: a 48px grey field showing the chosen option, opening a menu of
 * options anchored to it (a popover, also inside a sheet). `dot` puts a small colour
 * dot before the label (a Tailwind bg-* class) — the import mapping uses it to tie a
 * field to its column in the preview. Labels arrive already translated.
 *
 * Non-modal on purpose: a modal menu inside a dialog swallows the first click.
 */
export function ClearSelect<T extends string | number | null>({
  id,
  value,
  options,
  onChange,
  placeholder,
  dot,
  ariaLabelledBy,
  className,
}: {
  id?: string;
  value: T;
  options: ClearSelectOption<T>[];
  onChange: (value: T) => void;
  /** Shown when no option matches `value`. */
  placeholder?: string;
  dot?: string;
  ariaLabelledBy?: string;
  className?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        id={id}
        aria-labelledby={ariaLabelledBy}
        className={cn(
          "flex h-12 w-full cursor-pointer items-center gap-2.5 rounded-clear-row border-[1.5px] border-transparent bg-clear-tile pr-3 pl-4 text-left font-clear text-[15px] font-semibold text-clear-ink outline-none transition-colors focus-visible:border-clear-ink data-[popup-open]:border-clear-ink",
          className,
        )}
      >
        {dot && <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", dot)} />}
        <span className={cn("min-w-0 flex-1 truncate", !current && "text-clear-placeholder")}>{current?.label ?? placeholder}</span>
        <IconChevronDown aria-hidden size={18} stroke={2} className="shrink-0 text-clear-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[min(320px,var(--available-height))] font-clear">
        {options.map((o) => (
          <DropdownMenuItem
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            className={cn("mt-0 py-2.5 text-[15px]", o.value === value && "font-bold")}
          >
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.value === value && <IconCheck aria-hidden size={16} stroke={2.4} />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

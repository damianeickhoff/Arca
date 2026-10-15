"use client";

import { cn } from "@/lib/utils";

/**
 * The Clear on/off switch: 44×26 pill, on = primary (black, inverts in dark mode).
 * Always pass a visible label via `aria-labelledby`, or an already translated
 * `label` for aria-label.
 */
export function ClearSwitch({
  checked,
  onCheckedChange,
  label,
  labelledBy,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-[26px] w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50 disabled:opacity-45",
        checked ? "bg-clear-primary" : "bg-clear-line",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-5 rounded-full bg-clear-card shadow-sm transition-transform",
          checked ? "translate-x-[21px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

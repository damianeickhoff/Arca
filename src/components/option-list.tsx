"use client";

import { IconCheck as Check } from "@tabler/icons-react";

// Shared list-style option picker — a rounded card of full-width rows with a
// checkmark on the active one. Used for single-choice settings (theme, language,
// currency, recurrence frequency/type) in place of a pill/segmented control.
export function OptionList<T extends string>({
  options,
  value,
  onSelect,
  disabled,
}: {
  options: { value: T; label: string; description?: string }[];
  value: T;
  onSelect: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-[var(--dialog-content-background)] overflow-hidden divide-y divide-border/40">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(o.value)}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-foreground/[0.04] transition-colors disabled:opacity-50 disabled:cursor-default"
        >
          <span className="flex-1 min-w-0">
            <span className="block font-medium">{o.label}</span>
            {o.description && (
              <span className="block text-xs text-foreground/50 mt-0.5">{o.description}</span>
            )}
          </span>
          {value === o.value && <Check className="size-5 text-foreground/70 shrink-0" />}
        </button>
      ))}
    </div>
  );
}

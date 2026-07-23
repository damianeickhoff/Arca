"use client";

import {
  IconSearch as Search,
  IconX as X
} from "@tabler/icons-react";

interface Props {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  placeholder: string;
  /** Called when "Reset" is pressed (text is non-empty). Defaults to clearing via onChange. */
  onReset?: () => void;
}

/** Expanding search input used by every mobile header's search-toggle icon — single
 * source of truth so the open animation stays consistent everywhere it's used. */
export function SearchToggleInput({ value, onChange, onClose, placeholder, onReset }: Props) {
  return (
    <div className="relative flex-1 animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-200">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-foreground pointer-events-none" />
      <input
        autoFocus
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={`w-full text-sm rounded-full pl-10 py-3.5 bg-white dark:bg-white/12 focus:outline-none ${value ? "pr-24" : "pr-10"}`}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
        {value && (
          <button
            onClick={() => (onReset ? onReset() : onChange({ target: { value: "" } } as React.ChangeEvent<HTMLInputElement>))}
            className="h-9 px-3 rounded-full bg-foreground/3 flex items-center justify-center text-xs font-medium"
          >
            Reset
          </button>
        )}
        <button
          onClick={onClose}
          className="size-9 rounded-full bg-foreground/3 flex items-center justify-center shrink-0"
          aria-label="Zoeken sluiten"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

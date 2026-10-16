"use client";

import { cn } from "@/lib/utils";

export interface OptionListItem<T extends string> {
  value: T;
  label: string;
  description?: string;
  /** A leading glyph (icon or monogram), drawn in a tile; the chosen one turns ember. */
  icon?: React.ReactNode;
  /** The option's own language, for a label written in it ("Nederlands"). */
  lang?: string;
}

/**
 * A single-choice settings list (Clear): theme, language, currency, budget modes.
 * `rows` is a stacked list (the chosen row on a grey fill), `cards` a grid of tiles
 * (the chosen one white with a black outline). Either way a radiogroup with a radio
 * dot per option. Labels arrive already translated; `label` names the group.
 */
export function OptionList<T extends string>({
  options,
  value,
  onSelect,
  disabled,
  label,
  labelledBy,
  layout = "rows",
  className,
}: {
  options: OptionListItem<T>[];
  value: T;
  onSelect: (v: T) => void;
  disabled?: boolean;
  label?: string;
  labelledBy?: string;
  layout?: "rows" | "cards";
  className?: string;
}) {
  const cards = layout === "cards";
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      className={cn(cards ? "grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]" : "flex flex-col gap-1", className)}
    >
      {options.map((o) => {
        const on = o.value === value;
        const tile = o.icon && (
          <span
            aria-hidden
            className={cn(
              "inline-flex size-11 shrink-0 items-center justify-center rounded-clear-icon text-[15px] font-extrabold [&_svg]:size-5",
              on ? "bg-clear-ember text-clear-ember-ink" : cards ? "bg-clear-card text-clear-ink-2" : "bg-clear-tile text-clear-ink-2",
            )}
          >
            {o.icon}
          </span>
        );
        const text = (
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span lang={o.lang} className="text-[15px] font-bold">{o.label}</span>
            {o.description && <span className="text-[13px] leading-[1.45] text-clear-muted">{o.description}</span>}
          </span>
        );
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onSelect(o.value)}
            className={cn(
              "flex w-full cursor-pointer border-2 text-left font-clear text-clear-ink outline-none transition-colors focus-visible:ring-3 focus-visible:ring-clear-ember/50 disabled:cursor-default disabled:opacity-60",
              cards
                ? cn("flex-col gap-3.5 rounded-clear-tile p-[18px]", on ? "border-clear-ink bg-clear-card" : "border-transparent bg-clear-tile hover:bg-clear-line")
                : cn("min-h-16 items-center gap-3.5 rounded-clear-row py-2.5 pr-4 pl-2.5", on ? "border-transparent bg-clear-tile" : "border-transparent hover:bg-clear-tile"),
            )}
          >
            {cards ? (
              <>
                <span className="flex w-full items-center justify-between gap-2">
                  {tile ?? <span />}
                  <RadioDot on={on} />
                </span>
                {text}
              </>
            ) : (
              <>
                {tile}
                {text}
                <RadioDot on={on} />
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

function RadioDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border-2",
        on ? "border-clear-ink" : "border-clear-placeholder bg-clear-card",
      )}
    >
      {on && <span className="size-2.5 rounded-full bg-clear-ink" />}
    </span>
  );
}

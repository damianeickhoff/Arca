"use client";

import { useId, useState } from "react";
import { IconCheck, IconPencil } from "@tabler/icons-react";
import { IconPicker } from "@/components/icon-picker";
import { ColorPicker } from "@/components/color-picker";
import { isBrandIcon } from "@/components/icon";
import { cn } from "@/lib/utils";

export type IconColorSwatch = { hex: string; /** Already translated, e.g. "Blue". */ label: string };

/**
 * The icon and colour of something you create (a savings goal, a debt): the big icon
 * tile — tap it to pick another icon, a pencil shows on hover — beside a row of colour
 * swatches and the full colour picker for any other colour. Brand logos keep their own
 * colours, so the swatches hide for them. `tile` is the rendered icon (the caller knows
 * its fallback glyph); every string comes already translated.
 */
export function IconColorField({
  icon,
  color,
  onIconChange,
  onColorChange,
  swatches,
  tile,
  label,
  changeIconLabel,
  pickerOpen,
  onPickerOpenChange,
  anchor,
  className,
}: {
  icon: string | null;
  color: string;
  onIconChange: (icon: string | null) => void;
  onColorChange: (hex: string) => void;
  swatches: readonly IconColorSwatch[];
  tile: React.ReactNode;
  /** The group's label, e.g. "Icon & colour". */
  label: string;
  /** The tile button's accessible name, e.g. "Change icon". */
  changeIconLabel: string;
  /** Optional control of the icon picker, e.g. to pause a walkthrough while it is up. */
  pickerOpen?: boolean;
  onPickerOpenChange?: (open: boolean) => void;
  /** data-tip-anchor for a walkthrough step. */
  anchor?: string;
  className?: string;
}) {
  const id = useId();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = pickerOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onPickerOpenChange?.(next);
  };
  const brand = !!icon && isBrandIcon(icon);

  return (
    <div data-tip-anchor={anchor} className={cn("flex items-center gap-[18px]", className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={changeIconLabel}
        title={changeIconLabel}
        className="group relative shrink-0 cursor-pointer rounded-clear-tile outline-none transition-transform focus-visible:ring-3 focus-visible:ring-clear-ink/40 active:scale-[0.96]"
      >
        {tile}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-1.5 -bottom-1.5 inline-flex size-6 items-center justify-center rounded-full bg-clear-primary text-clear-primary-ink opacity-0 shadow-clear-float transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <IconPencil size={13} stroke={2.4} />
        </span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span id={`${id}-colour`} className="text-[13px] font-bold text-clear-ink-2">
          {label}
        </span>
        {!brand && (
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-labelledby={`${id}-colour`} className="contents">
              {swatches.map((s) => {
                const on = color.toLowerCase() === s.hex.toLowerCase();
                return (
                  <button
                    key={s.hex}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={s.label}
                    onClick={() => onColorChange(s.hex)}
                    className={cn(
                      "inline-flex size-[34px] cursor-pointer items-center justify-center rounded-full text-clear-ink",
                      on ? "ring-2 ring-clear-ink ring-offset-2 ring-offset-clear-card" : "ring-1 ring-clear-ink/8 ring-inset",
                    )}
                    style={{ background: `color-mix(in srgb, ${s.hex} 16%, transparent)` }}
                  >
                    {on ? <IconCheck size={15} stroke={3} aria-hidden /> : <span aria-hidden className="size-3 rounded-full" style={{ background: s.hex }} />}
                  </button>
                );
              })}
            </div>
            {/* Any other colour: the full picker; its swatch shows the current colour. */}
            <span className="inline-flex [&>button]:size-[34px]">
              <ColorPicker value={color} onChange={onColorChange} previewIcon={icon} />
            </span>
          </div>
        )}
      </div>
      <IconPicker value={icon} onChange={onIconChange} previewColor={color} open={open} onOpenChange={setOpen} hideDefaultTrigger />
    </div>
  );
}

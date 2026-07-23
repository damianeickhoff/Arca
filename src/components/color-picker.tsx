"use client";

import { useEffect, useState } from "react";
import {
  IconRotate2 as RotateCcw
} from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconGlyph } from "@/components/icon-picker";
import { isBrandIcon } from "@/components/icon";
import { contrastIconColor, hexToHue, hexToLightness, hueToHex } from "@/lib/color-luminance";

/** Fallback icon/text color used everywhere a category/debt/etc. has no color set. */
export const DEFAULT_ICON_COLOR = "#FFFFFF";

/** Curated, on-brand default colors. Every option (preset or custom hue) is picked
 * at the same saturation/lightness so nothing ever looks washed out or muddy. */
const PRESETS = [
  hueToHex(4),   // red
  hueToHex(28),  // orange
  hueToHex(48),  // yellow
  hueToHex(142), // green
  hueToHex(172), // teal
  hueToHex(205), // blue
];

const SATURATION = 82;
// Black at one end, but capped at a mid-tone rather than running up to white —
// past ~50% lightness the color gets too pale for a white icon to read on.
const LIGHTNESS_MIN = 0;
const LIGHTNESS_MAX = 50;

const HUE_GRADIENT =
  "linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))";

function isPreset(hex: string): boolean {
  return PRESETS.some((c) => c.toLowerCase() === hex.toLowerCase());
}

// Matches the thumb's `size-9` (36px), which equals the track's own height
// (`h-9`) so the round thumb fills the bar top-to-bottom — also used to keep it
// fully inside the track at both ends instead of centering on 0%/100% and
// hanging half off the edge.
const THUMB_PX = 36;

function thumbLeft(ratio: number): string {
  const clamped = Math.min(1, Math.max(0, ratio));
  return `calc(${THUMB_PX / 2}px + (100% - ${THUMB_PX}px) * ${clamped})`;
}

function ratioFromTrackClick(clientX: number, rect: DOMRect): number {
  const usable = rect.width - THUMB_PX;
  if (usable <= 0) return 0;
  return Math.min(1, Math.max(0, (clientX - rect.left - THUMB_PX / 2) / usable));
}

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  /** Show a live preview of this icon tinted with the color being picked.
   * Brand icons always preview in their own official color, since the chosen
   * color never actually applies to them. Ignored when `inline` is set. */
  previewIcon?: string | null;
  /** The color being picked is a chip *background* (e.g. a brand icon rule's
   * background), not a foreground tint — so the preview always reflects
   * `value` even for brand icons, at the same size the icon actually renders. */
  previewAsBackground?: boolean;
  /** Render the picker as a panel that expands in place below the trigger
   * instead of opening a dialog — used for accounts and categories, where the
   * trigger sits next to a name field and the picker should unfold underneath
   * it. The caller's wrapping row needs `flex flex-wrap` for the panel to drop
   * onto its own line. */
  inline?: boolean;
}

export function ColorPicker({ value, onChange, previewIcon, previewAsBackground = false, inline = false }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  // Whether the current value counts as "custom" (not one of the presets) — drives
  // which swatch reads as selected. Independent of whether the hue/brightness
  // controls are actually showing (see `controlsOpen` below).
  const valueIsCustom = !!value && !isPreset(value);
  // Hue/brightness bars only ever appear once the custom swatch is tapped —
  // never just because the current color happens to already be a custom one.
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hue, setHue] = useState(() => (value ? hexToHue(value) : 0));
  // Presets sit at lightness 54, above the custom slider's 50% cap — clamp
  // whatever we seed from so the slider thumb never starts past its own track.
  const [lightness, setLightness] = useState(() => (value ? Math.min(LIGHTNESS_MAX, hexToLightness(value)) : LIGHTNESS_MAX));
  const previewIsBrand = !!previewIcon && isBrandIcon(previewIcon);
  const swatchColor = value || DEFAULT_ICON_COLOR;

  // Re-seed from the current value only when the picker (re)opens — not on every
  // value change, since the hue/lightness state below is itself what drives most
  // value changes while open.
  useEffect(() => {
    if (open) {
      setControlsOpen(false);
      if (value) {
        setHue(hexToHue(value));
        setLightness(Math.min(LIGHTNESS_MAX, hexToLightness(value)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleHueChange = (h: number) => {
    setHue(h);
    onChange(hueToHex(h, SATURATION, lightness));
  };

  const handleLightnessChange = (l: number) => {
    setLightness(l);
    onChange(hueToHex(hue, SATURATION, l));
  };

  const hueColor = hueToHex(hue, SATURATION, lightness);

  const swatchesRow = (
    <div className="flex items-center gap-2.5 rounded-2xl bg-foreground/5 p-3 flex-wrap">
      <button
        type="button"
        onClick={() => {
          setControlsOpen(true);
          onChange(hueToHex(hue, SATURATION, lightness));
        }}
        className="relative size-9 rounded-full shrink-0 transition-transform hover:scale-105"
        style={{ background: "conic-gradient(from 0deg, red, yellow, lime, cyan, blue, magenta, red)" }}
        title="Custom color"
      >
        <span
          className="absolute inset-0 m-auto size-5 rounded-full"
          style={{ backgroundColor: contrastIconColor(hueColor) }}
        />
      </button>

      <div className="w-px self-stretch bg-foreground/10 shrink-0" />

      {PRESETS.map((c) => {
        const selected = !valueIsCustom && value.toLowerCase() === c.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            onClick={() => {
              setControlsOpen(false);
              onChange(c);
            }}
            className={`relative size-9 rounded-full shrink-0 transition-transform ${selected ? "ring-2 ring-offset-2 ring-offset-background ring-foreground scale-105" : "hover:scale-105"}`}
            style={{ backgroundColor: c }}
          >
            {selected && (
              <span
                className="absolute inset-0 m-auto size-2.5 rounded-full"
                style={{ backgroundColor: contrastIconColor(c) }}
              />
            )}
          </button>
        );
      })}
    </div>
  );

  // Always mounted (never conditionally unmounted) so the grid-rows toggle below
  // can transition smoothly on the way in *and* out — an unmounted element can't
  // animate its own removal.
  const customControls = (
    <div
      aria-hidden={!controlsOpen}
      className={`grid transition-[grid-template-rows,opacity] duration-250 ease-out ${controlsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
    >
      <div className="overflow-hidden">
        <div className="space-y-2.5 pt-2.5">
          <div
            className="relative h-9 rounded-full cursor-pointer"
            style={{ background: HUE_GRADIENT }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              handleHueChange(Math.round(ratioFromTrackClick(e.clientX, rect) * 360));
            }}
          >
            <input
              type="range"
              min={0}
              max={360}
              value={hue}
              onChange={(e) => handleHueChange(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Hue"
            />
            <span
              className="absolute top-0 size-9 rounded-full border-2 border-white shadow pointer-events-none"
              style={{ left: thumbLeft(hue / 360), backgroundColor: hueColor, transform: "translateX(-50%)" }}
            />
          </div>

          <div
            className="relative h-9 rounded-full cursor-pointer"
            style={{ background: `linear-gradient(to right, hsl(${hue} ${SATURATION}% ${LIGHTNESS_MIN}%), hsl(${hue} ${SATURATION}% ${LIGHTNESS_MAX}%))` }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = ratioFromTrackClick(e.clientX, rect);
              handleLightnessChange(Math.round(LIGHTNESS_MIN + ratio * (LIGHTNESS_MAX - LIGHTNESS_MIN)));
            }}
          >
            <input
              type="range"
              min={LIGHTNESS_MIN}
              max={LIGHTNESS_MAX}
              value={lightness}
              onChange={(e) => handleLightnessChange(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Brightness"
            />
            <span
              className="absolute top-0 size-9 rounded-full border-2 border-white shadow pointer-events-none"
              style={{ left: thumbLeft((lightness - LIGHTNESS_MIN) / (LIGHTNESS_MAX - LIGHTNESS_MIN)), backgroundColor: hueColor, transform: "translateX(-50%)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );

  if (inline) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="size-12 rounded-full shrink-0 cursor-pointer transition-transform hover:scale-105"
          style={{ backgroundColor: swatchColor }}
        />

        <div
          aria-hidden={!open}
          className={`basis-full w-full grid transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0 mt-0"}`}
        >
          <div className="overflow-hidden">
            <div className="space-y-3">
              {swatchesRow}
              {customControls}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="size-12 rounded-full shrink-0 cursor-pointer transition-transform hover:scale-105"
        style={{ backgroundColor: swatchColor }}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm z-[60]" overlayClassName="z-[55] backdrop-blur-lg bg-foreground/20">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <DialogTitle>Color kiezen</DialogTitle>
              <button
                type="button"
                onClick={() => onChange("")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Default color"
              >
                <RotateCcw className="size-3.5" />
                Standaard
              </button>
            </div>
          </DialogHeader>
          <div className="space-y-3">
            {swatchesRow}
            {customControls}

            {previewIcon && (
              <div className="flex items-center gap-2.5 rounded-lg bg-foreground/5 px-3 py-2">
                <div
                  className={previewAsBackground ? "size-14 rounded-full shrink-0 flex items-center justify-center" : "size-9 rounded-full shrink-0 flex items-center justify-center"}
                  style={previewAsBackground
                    ? { backgroundColor: value || "#ffffff" }
                    : previewIsBrand
                    ? { backgroundColor: "white" }
                    : value
                    ? { backgroundColor: value }
                    : undefined}
                >
                  <IconGlyph iconKey={previewIcon} color={previewAsBackground || previewIsBrand ? undefined : (value ? contrastIconColor(value) : undefined)} size={previewAsBackground ? 35 : 18} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {previewAsBackground
                    ? (value ? "Preview with this background color" : "Standaard (witte) achtergrond")
                    : previewIsBrand ? "Merk-iconen houden hun eigen kleur" : value ? "Preview with this icon" : "Default color (no color set)"}
                </p>
              </div>
            )}

            <Button className="w-full" onClick={() => setOpen(false)}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

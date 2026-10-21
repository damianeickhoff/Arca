// The Clear palette's pastel tones, shared by chips, icon tiles and stat tiles so a
// "mint" thing looks the same everywhere. Each tone is a soft fill with its own ink;
// "ember" is the one saturated fill (ink text), "ink" the inverted black capsule.

export type ClearTone =
  | "neutral"
  | "mint"
  | "peach"
  | "sky"
  | "lilac"
  | "butter"
  | "rose"
  | "stone"
  | "ember"
  | "ink";

export const TONE_FILL: Record<ClearTone, string> = {
  neutral: "bg-clear-tile text-clear-ink",
  mint: "bg-clear-mint text-clear-mint-ink",
  peach: "bg-clear-peach text-clear-peach-ink",
  sky: "bg-clear-sky text-clear-sky-ink",
  lilac: "bg-clear-lilac text-clear-lilac-ink",
  butter: "bg-clear-butter text-clear-butter-ink",
  rose: "bg-clear-rose text-clear-rose-ink",
  stone: "bg-clear-stone text-clear-stone-ink",
  ember: "bg-clear-ember text-clear-ember-ink",
  ink: "bg-clear-primary text-clear-primary-ink",
};

/** The pastels in the order a list hands them out when its items have no colour. */
export const PASTEL_ORDER = ["mint", "peach", "butter", "lilac", "sky", "rose", "stone"] as const satisfies readonly ClearTone[];
export type PastelTone = (typeof PASTEL_ORDER)[number];

/**
 * The pastel closest to a colour picked for a category or group ("#E5484D" → peach),
 * by its hue; greys become stone. Null for anything that isn't a #rrggbb colour.
 */
export function pastelToneForColor(color: string | null | undefined): PastelTone | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(color?.trim() ?? "");
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta < 0.12) return "stone";
  let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue < 40 || hue >= 345) return "peach";
  if (hue < 70) return "butter";
  if (hue < 170) return "mint";
  if (hue < 250) return "sky";
  if (hue < 290) return "lilac";
  return "rose";
}

/**
 * One pastel per item, in order: the tone of the item's own colour while no earlier
 * item has it, otherwise the next unused pastel from PASTEL_ORDER (round again once
 * all seven are taken).
 */
export function pastelTones(colors: readonly (string | null | undefined)[]): PastelTone[] {
  const used = new Set<PastelTone>();
  return colors.map((color) => {
    if (used.size === PASTEL_ORDER.length) used.clear();
    const own = pastelToneForColor(color);
    const tone = own && !used.has(own) ? own : PASTEL_ORDER.find((p) => !used.has(p))!;
    used.add(tone);
    return tone;
  });
}

/** Perceived luminance check — distinguishes truly near-white colors from vivid/saturated
 * ones (e.g. a bright yellow has a high raw hex value but is not "very light"). */
export function isVeryLightColor(hex: string): boolean {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 240;
}

/** Hue angle (0-360) of a hex color, for driving a hue-only slider. */
export function hexToHue(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue: number;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

/** Lightness (0-100) of a hex color, for seeding a brightness slider. */
export function hexToLightness(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return Math.round(((max + min) / 2) * 100);
}

// The hue range (warm-orange through cyan-blue) that reads as "light" enough to
// need a black glyph on top of it — everything outside it needs white instead.
// Derived from the two boundary colors rather than hardcoded angles so it stays
// exact if those reference colors ever change.
const BLACK_ICON_HUE_START = hexToHue("#f48124");
const BLACK_ICON_HUE_END = hexToHue("#24b2f4");

// Beyond these lightness extremes the color reads as near-white or near-black
// regardless of hue, so brightness overrides the hue rule below.
const VERY_LIGHT = 75;
const VERY_DARK = 20;

/** Picks whichever of black/white reads better as a glyph color on top of `hex`.
 * Brightness takes priority — a very light color (near-white, however it got
 * there: a pale hue or the brightness slider pushed toward white) always gets a
 * black glyph, and a very dark one always gets white, since a hue-only rule would
 * otherwise pick white-on-near-white or black-on-near-black. Within the mid
 * range, hue decides: colors between orange (#f48124) and light blue (#24b2f4) —
 * i.e. yellows, greens, teals — read as light enough for a black glyph;
 * everything else (reds, blues, purples, magentas) keeps a white one. */
export function contrastIconColor(hex: string): string {
  const lightness = hexToLightness(hex);
  if (lightness >= VERY_LIGHT) return "#000000";
  if (lightness <= VERY_DARK) return "#ffffff";
  const hue = hexToHue(hex);
  const inLightRange = hue >= BLACK_ICON_HUE_START && hue <= BLACK_ICON_HUE_END;
  return inLightRange ? "#000000" : "#ffffff";
}

/** Hex color for a given hue at a fixed, vivid saturation/lightness — used by the
 * hue-only color picker slider so every pickable color stays on-brand and legible. */
export function hueToHex(hue: number, saturation = 82, lightness = 54): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/** Chip background that automatically matches an icon color: the same hue mixed
 * toward the current theme's card surface (`var(--card)`), so a darker icon glyph
 * sits on a lighter, opaque tint of itself (e.g. #d497e5 → a soft #f9ecfd-like wash
 * in light mode) that renders the same regardless of what's actually behind it —
 * unlike mixing toward `transparent`, which would be backdrop-dependent. Returns
 * null for empty input. */
export function solidBackgroundColor(color: string, alpha = 0.14): string | null {
  const trimmed = color.trim();
  if (!trimmed) return null;
  return `color-mix(in srgb, ${trimmed} ${Math.round(alpha * 100)}%, var(--card))`;
}

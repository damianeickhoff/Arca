// Brand-icon lookup by name, split out of auto-brand.ts so it can be imported from
// places that must not pull in React components — auto-brand.ts imports
// @/components/icon for resolveTransactionIcon's logo backdrop, which makes it
// unusable from src/db/index.ts (the boot migration/backfill).
import { BRAND_MAP } from "@/lib/brand-map";

function candidateKeys(name: string): string[] {
  const lower = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const words = lower.split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  return [
    words.join("-"),   // albert-heijn, mcdonald-s, burger-king (slug format)
    words.join(""),    // albertheijn, mcdonalds, burgerking
    words[0],          // albert, mcdonald (first word fallback)
  ];
}

/** The brand's own primary color for an icon key, e.g. "albert-heijn" → "#04ACE6".
 * Null for anything that isn't a brand logo (Tabler glyphs, uploads, emoji). Keys may
 * carry ?s=/x=/y= transform params — those are stripped, same as parseBrandKey does. */
export function brandColorForIconKey(iconKey: string | null | undefined): string | null {
  if (!iconKey) return null;
  const base = iconKey.includes("?") ? iconKey.slice(0, iconKey.indexOf("?")) : iconKey;
  const entry = BRAND_MAP[base];
  return entry ? `#${entry.hex}` : null;
}

export function detectBrandIcon(
  merchantName: string | null | undefined,
): { iconKey: string; color: string } | null {
  if (!merchantName) return null;
  for (const key of candidateKeys(merchantName)) {
    if (key in BRAND_MAP) return { iconKey: key, color: `#${BRAND_MAP[key].hex}` };
  }
  return null;
}

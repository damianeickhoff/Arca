// Auto-detects a brand icon from a merchant name using the @thesvg/icons library.
// Manual brand rules (stored on the transaction) always take priority over this.
import { extractMerchantName } from "./parse-transaction-location";
import { brandColorForIconKey, detectBrandIcon } from "@/lib/brand-detect";
import { isLogoStyleIcon } from "@/components/icon";
import { TRANSFER_TYPE_ICONS, TRANSFER_TYPE_COLORS, DEFAULT_TRANSFER_ICON, DEFAULT_TRANSFER_COLOR } from "@/lib/transfer-types";

// Lives in @/lib/brand-detect (React-free, so the DB boot backfill can use it too);
// re-exported here so existing call sites keep importing it from this module.
export { detectBrandIcon };

// Initials avatar for transactions with no brand or category icon — mainly
// person-to-person transfers, where the description is the counterparty's name
// (ING exports store the "Naam" column as transactions.description).
const AVATAR_PALETTE = ["#0f766e", "#6366f1", "#e11d48", "#0ea5e9", "#a855f7", "#f59e0b"];

export function getInitials(name: string): string {
  const cleaned = name.replace(/[^\p{L}\s.'-]/gu, " ").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function avatarColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

// Neutral "uncategorized" chip — a gray question mark on a theme-aware gray
// background (lighter gray in light mode, #818181 in dark mode). Both are `null`
// on purpose: passing no iconKey/color makes <Icon> render its placeholder chip,
// which is where that theme-aware styling lives (a single solid color can't be
// theme-aware). Used wherever a transaction or recurring bill has no category (and
// no brand) to fall back on.
export const UNCATEGORIZED_ICON: string | null = null;
export const UNCATEGORIZED_COLOR: string | null = null;

// Single helper used by all transaction display components.
// Priority: manual brand rule -> merchant icon -> auto-detected brand -> category icon
// -> initials avatar / uncategorized cross.
export function resolveTransactionIcon(t: {
  brandIcon?: string | null;
  brandIconColor?: string | null;
  brandIconBgColor?: string | null;
  /** The transaction's merchant profile icon, when it has one. Outranks the category
   * icon and brand auto-detection: a merchant icon is either an explicit user choice
   * or a name match the user can correct, so it should be what identifies the row. */
  merchantIcon?: string | null;
  merchantColor?: string | null;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  rawDescription?: string | null;
  description: string;
  isInternalTransfer?: boolean | number;
  transferType?: string | null;
}): { iconKey: string | null | undefined; color: string | null; background: string | null; initials?: string | null } {
  // Logo-style icons (brand SVGs, uploaded images, custom emoji/text) render on a
  // transparent chip and need a solid backdrop to stay legible; fall back to white
  // when no explicit background color was configured. Baked in here so every call
  // site gets it automatically, rather than each one remembering to re-derive it.
  function withLogoBackdrop(iconKey: string, background: string | null) {
    return background ?? (isLogoStyleIcon(iconKey) ? "#ffffff" : null);
  }

  if (t.brandIcon) {
    return {
      iconKey: t.brandIcon,
      color: t.brandIconColor ?? null,
      background: withLogoBackdrop(t.brandIcon, t.brandIconBgColor ?? null),
    };
  }

  // Internal transfers never carry a category, so their icon comes from the
  // transfer sub-type instead (savings, cash withdrawal, ...), falling back to a
  // generic swap-arrows glyph when no sub-type has been set or auto-detected.
  // Checked before the merchant icon: a transfer between your own accounts has no
  // merchant, and any stale link shouldn't override the transfer glyph.
  if (t.isInternalTransfer) {
    const iconKey = (t.transferType && TRANSFER_TYPE_ICONS[t.transferType]) || DEFAULT_TRANSFER_ICON;
    const color = (t.transferType && TRANSFER_TYPE_COLORS[t.transferType]) || DEFAULT_TRANSFER_COLOR;
    return { iconKey, color, background: null };
  }

  if (t.merchantIcon) {
    return {
      iconKey: t.merchantIcon,
      // Same rule as the merchant surfaces themselves: the logo's own brand color
      // wins over whatever is stored, so the two never drift apart.
      color: brandColorForIconKey(t.merchantIcon) ?? t.merchantColor ?? null,
      background: withLogoBackdrop(t.merchantIcon, null),
    };
  }

  const merchant = extractMerchantName(t.rawDescription ?? t.description);
  const auto = detectBrandIcon(merchant);
  if (auto) {
    return { iconKey: auto.iconKey, color: auto.color, background: withLogoBackdrop(auto.iconKey, null) };
  }

  if (t.categoryIcon) {
    return { iconKey: t.categoryIcon, color: t.categoryColor ?? null, background: withLogoBackdrop(t.categoryIcon, null) };
  }

  // No brand and no category icon. A genuinely uncategorized item (no category at
  // all) gets the neutral gray question-mark chip (iconKey/color left null so
  // <Icon> renders its themed placeholder); a categorized-but-iconless one keeps an
  // initials avatar tinted with its category color.
  if (!t.categoryColor && !t.categoryIcon) {
    return { iconKey: UNCATEGORIZED_ICON, color: UNCATEGORIZED_COLOR, background: null };
  }
  const name = merchant ?? t.description;
  return { iconKey: null, color: t.categoryColor ?? avatarColorFor(name), background: null, initials: getInitials(name) };
}

// Resolves the icon shown for a recurring bill/subscription/debt. Recurring items no
// longer carry their own icon — they inherit it from an auto-detected brand (by name)
// or their linked category, falling back to the uncategorized cross. Mirrors
// resolveTransactionIcon so bills and their matched transactions look identical.
export function resolveRecurringIcon(
  item: { name: string; friendlyName?: string | null; categoryId?: number | null },
  categoriesById?: Map<number, { icon: string | null; color: string | null }>,
): { iconKey: string | null | undefined; color: string | null; background: string | null } {
  const cat = item.categoryId != null ? categoriesById?.get(item.categoryId) : undefined;
  const r = resolveTransactionIcon({
    categoryIcon: cat?.icon ?? null,
    categoryColor: cat?.color ?? null,
    description: item.friendlyName ?? item.name,
  });
  return { iconKey: r.iconKey, color: r.color, background: r.background };
}

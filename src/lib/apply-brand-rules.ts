import { db } from "@/db";
import { brandIconRules, transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { BrandIconRule } from "@/db/schema";
import { DEFAULT_BRAND_ICONS, type DefaultBrandIconRule } from "@/config/brandIcons";

function matchBrandRule(description: string, rule: BrandIconRule): boolean {
  const desc = description.trim().toLowerCase();
  const pat  = rule.namePattern.trim().toLowerCase();

  if (rule.nameWholeWord) {
    const escaped = pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(desc);
  }
  if (rule.nameWildcard) return desc.includes(pat);
  return desc === pat;
}

function matchDefaultBrandRule(description: string, rule: DefaultBrandIconRule): boolean {
  const desc = description.trim().toLowerCase();
  const pat  = rule.namePattern.trim().toLowerCase();

  if (rule.matchType === "word") {
    const escaped = pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(desc);
  }
  if (rule.matchType === "contains") return desc.includes(pat);
  return desc === pat;
}

/**
 * Returns the matching rule's icon + colors, or null.
 * Custom rules (from the brand icons settings page) are checked first, so a
 * user override always wins; the static defaults in src/config/brandIcons.ts
 * are only consulted as a fallback.
 */
export function matchBrandRules(description: string, rules: BrandIconRule[]): { brandIcon: string; iconColor: string | null; iconBgColor: string | null } | null {
  for (const rule of rules) {
    if (matchBrandRule(description, rule)) return { brandIcon: rule.brandIcon, iconColor: rule.iconColor ?? null, iconBgColor: rule.iconBgColor ?? null };
  }
  for (const rule of DEFAULT_BRAND_ICONS) {
    if (matchDefaultBrandRule(description, rule)) return { brandIcon: rule.brandIcon, iconColor: rule.iconColor ?? null, iconBgColor: rule.iconBgColor ?? null };
  }
  return null;
}

/**
 * Apply all brand icon rules to transactions.
 * Brand icon matching is independent of category assignment, so this runs over
 * every transaction regardless of `manuallyCategorized` (that flag only governs category).
 * Returns the number of transactions updated.
 */
export async function applyAllBrandRules(): Promise<number> {
  const rules = await db.select().from(brandIconRules);
  if (rules.length === 0 && DEFAULT_BRAND_ICONS.length === 0) return 0;

  const rows = await db
    .select({ id: transactions.id, description: transactions.description, brandIcon: transactions.brandIcon, brandIconColor: transactions.brandIconColor, brandIconBgColor: transactions.brandIconBgColor })
    .from(transactions);

  let updated = 0;
  for (const row of rows) {
    const match = matchBrandRules(row.description, rules);
    const newIcon    = match?.brandIcon ?? null;
    const newColor   = match?.iconColor ?? null;
    const newBgColor = match?.iconBgColor ?? null;
    if (newIcon !== (row.brandIcon ?? null) || newColor !== (row.brandIconColor ?? null) || newBgColor !== (row.brandIconBgColor ?? null)) {
      await db.update(transactions).set({ brandIcon: newIcon, brandIconColor: newColor, brandIconBgColor: newBgColor }).where(eq(transactions.id, row.id));
      updated++;
    }
  }
  return updated;
}

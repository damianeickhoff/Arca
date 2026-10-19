import type { Database } from "better-sqlite3";
import { BRAND_MAP } from "@/lib/brand-map";
import { brandColorForIconKey } from "@/lib/brand-detect";
import { normalizeMerchantKey } from "@/lib/merchant-name";
import { descriptionMatches, type PatternMatchType } from "@/lib/merchant-patterns";

// One-time boot migration (merchant-first rules): brand icon rules become merchants.
// A rule ("description contains X → logo Y") turns into a "Recognised by" pattern on
// the merchant those transactions belong to, and its logo and colour into that
// merchant's own icon and colour. The old built-in defaults (src/config/brandIcons.ts,
// now deleted) migrate the same way, but only where they match a transaction — and
// "albert heijn" now gets the Albert Heijn logo instead of PayPal's.
// Runs synchronously at db init, after the merchant backfill; once brand_icon_rules is
// gone (dropped at the end) it does nothing.

interface LegacyRule {
  pattern: string;
  matchType: PatternMatchType;
  icon: string;
  color: string | null;
  /** The icon this rule used to stamp on transactions, when it differs (the old PayPal mistake). */
  stamped?: string;
}

/** The former src/config/brandIcons.ts defaults, frozen here for the migration. */
const LEGACY_DEFAULTS: LegacyRule[] = [
  { pattern: "albert heijn", matchType: "contains", icon: "albert-heijn", color: null, stamped: "paypal" },
  { pattern: "lidl", matchType: "contains", icon: "lidl", color: null },
  { pattern: "ikea", matchType: "contains", icon: "ikea", color: null },
  { pattern: "zalando", matchType: "contains", icon: "zalando", color: null },
  { pattern: "spotify", matchType: "contains", icon: "spotify", color: null },
  { pattern: "netflix", matchType: "contains", icon: "netflix", color: null },
  { pattern: "paypal", matchType: "contains", icon: "paypal", color: null },
  { pattern: "uber eats", matchType: "contains", icon: "uber-eats", color: null },
  { pattern: "mcdonalds", matchType: "contains", icon: "mcdonalds", color: null },
  { pattern: "starbucks", matchType: "contains", icon: "starbucks", color: null },
  { pattern: "airbnb", matchType: "contains", icon: "airbnb", color: null },
  { pattern: "steam", matchType: "word", icon: "steam", color: null },
  { pattern: "github", matchType: "contains", icon: "github", color: null },
  { pattern: "vodafone", matchType: "contains", icon: "vodafone", color: null },
  { pattern: "Amazon EU SARL", matchType: "contains", icon: "amazon-prime", color: null },
  { pattern: "Stripe", matchType: "contains", icon: "stripe", color: null },
  { pattern: "apple", matchType: "contains", icon: "apple", color: null },
];

function tableExists(sqlite: Database, name: string): boolean {
  return !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

/** "albert heijn" → "Albert Heijn"; a brand's own title when the logo is known. */
function merchantNameFor(rule: LegacyRule): string {
  const base = rule.icon.includes("?") ? rule.icon.slice(0, rule.icon.indexOf("?")) : rule.icon;
  const title = BRAND_MAP[base]?.title;
  if (title) return title;
  return rule.pattern.trim().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export function migrateBrandRulesToMerchants(sqlite: Database) {
  if (!tableExists(sqlite, "brand_icon_rules")) return;

  const cols = new Set((sqlite.prepare("PRAGMA table_info(brand_icon_rules)").all() as { name: string }[]).map((c) => c.name));
  const custom = (
    sqlite
      .prepare(`SELECT name_pattern, name_wildcard, name_whole_word, brand_icon${cols.has("icon_color") ? ", icon_color" : ""} FROM brand_icon_rules ORDER BY id`)
      .all() as { name_pattern: string; name_wildcard: number; name_whole_word: number; brand_icon: string; icon_color?: string | null }[]
  ).map(
    (r): LegacyRule & { custom: boolean } => ({
      pattern: r.name_pattern,
      matchType: r.name_whole_word ? "word" : r.name_wildcard ? "contains" : "exact",
      icon: r.brand_icon,
      color: r.icon_color ?? null,
      custom: true,
    }),
  );
  const rules = [...custom, ...LEGACY_DEFAULTS.map((r) => ({ ...r, custom: false }))].filter((r) => r.pattern.trim() && r.icon);

  const txs = sqlite
    .prepare("SELECT id, description, merchant_id, brand_icon FROM transactions WHERE is_manual_transfer = 0")
    .all() as { id: number; description: string; merchant_id: number | null; brand_icon: string | null }[];
  const liveMerchant = sqlite.prepare("SELECT id FROM merchants WHERE id = ? AND deleted = 0");
  const byKey = sqlite.prepare("SELECT id, deleted FROM merchants WHERE normalized_key = ?");
  const insertMerchant = sqlite.prepare("INSERT INTO merchants (name, normalized_key) VALUES (?, ?)");
  const insertPattern = sqlite.prepare("INSERT OR IGNORE INTO merchant_patterns (merchant_id, pattern, match_type) VALUES (?, ?, ?)");
  const setLook = sqlite.prepare("UPDATE merchants SET icon = ?, color = COALESCE(?, color) WHERE id = ?");
  const link = sqlite.prepare("UPDATE transactions SET merchant_id = ? WHERE id = ?");
  const clearIcon = sqlite.prepare("UPDATE transactions SET brand_icon = NULL, brand_icon_color = NULL, brand_icon_bg_color = NULL WHERE id = ?");

  const run = sqlite.transaction(() => {
    // First match wins, as it did for brand rules (custom before defaults).
    const claimed = new Set<number>();
    for (const rule of rules) {
      const matched = txs.filter((t) => !claimed.has(t.id) && descriptionMatches(t.description, rule.pattern, rule.matchType));
      if (matched.length === 0 && !rule.custom) continue;
      for (const t of matched) claimed.add(t.id);

      // The merchant most of the matched transactions already belong to, else one by name.
      const votes = new Map<number, number>();
      for (const t of matched) if (t.merchant_id != null) votes.set(t.merchant_id, (votes.get(t.merchant_id) ?? 0) + 1);
      let merchantId: number | null = null;
      for (const [id] of [...votes.entries()].sort((a, b) => b[1] - a[1])) {
        if (liveMerchant.get(id)) {
          merchantId = id;
          break;
        }
      }
      if (merchantId == null) {
        const name = merchantNameFor(rule);
        const key = normalizeMerchantKey(name);
        if (!key) continue;
        const found = byKey.get(key) as { id: number; deleted: number } | undefined;
        if (found?.deleted) continue;
        merchantId = found ? found.id : Number(insertMerchant.run(name, key).lastInsertRowid);
      }

      insertPattern.run(merchantId, rule.pattern.trim(), rule.matchType);
      setLook.run(rule.icon, rule.color ?? brandColorForIconKey(rule.icon), merchantId);
      for (const t of matched) {
        if (t.merchant_id == null) {
          link.run(merchantId, t.id);
          t.merchant_id = merchantId;
        }
        // The logo now comes from the merchant; a transaction-level icon the rule had
        // stamped on is dropped (one set by hand, different from the rule's, stays).
        if (t.merchant_id === merchantId && (t.brand_icon === rule.icon || (rule.stamped && t.brand_icon === rule.stamped))) clearIcon.run(t.id);
      }
    }
    sqlite.exec("DROP TABLE brand_icon_rules");
    sqlite.prepare("DELETE FROM app_settings WHERE key = 'brand_icons_config_hash'").run();
  });

  try {
    run();
  } catch (err) {
    // Leaves brand_icon_rules in place, so the next boot tries again.
    console.error("[brand-rules-migration] failed:", err);
  }
}

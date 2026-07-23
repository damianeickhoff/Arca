import crypto from "crypto";
import type { Database } from "better-sqlite3";
import { DEFAULT_CATEGORIES, normalizeMatchingPattern } from "@/config/categories";
import { DEFAULT_BRAND_ICONS } from "@/config/brandIcons";
import { matchRules } from "@/lib/apply-rules";
import { matchBrandRules } from "@/lib/apply-brand-rules";
import type { CategoryRule, BrandIconRule, Bank } from "@/db/schema";

// Runs synchronously (raw better-sqlite3, no drizzle) from src/db/index.ts module
// init, so it's guaranteed to finish before ANY query in the app — layouts and pages
// render in parallel in Next, so an async sync awaited in the layout still races the
// page's own queries and the first render shows stale data. Because every page
// (transitively) imports the db module, and a config file edit reloads that module
// graph in dev, changes to src/config/*.ts are visible on the very next request.

function hashOf(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function getSetting(sqlite: Database, key: string): string | null {
  const row = sqlite.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string | null } | undefined;
  return row?.value ?? null;
}

function setSetting(sqlite: Database, key: string, value: string) {
  sqlite.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

/**
 * Seeds src/config/categories.ts as a *first-run* set: each entry is inserted by its
 * stable `key` (stored in categories.config_key) only if no row with that key exists
 * yet. Existing default categories are left untouched — they're user-owned once seeded,
 * fully editable and deletable through the UI. Consequently:
 *   - editing config for an already-seeded entry no longer pushes changes to the DB;
 *   - a brand-new entry added to config still appears on the next boot;
 *   - removing an entry from config does NOT delete the (now user-owned) category.
 * Rules and parent links are likewise seeded only for freshly-created rows, so manual
 * edits survive.
 */
function syncDefaultCategories(sqlite: Database) {
  // Repair: drop rules whose category no longer exists (deletes done while foreign
  // keys were off left dangling rows — they're invisible in the UI and made every
  // rule application fail with an FK error).
  sqlite.prepare("DELETE FROM category_rules WHERE category_id NOT IN (SELECT id FROM categories)").run();

  const idsByKey = new Map<string, number>();
  const newlyCreated = new Set<number>();

  for (const def of DEFAULT_CATEGORIES) {
    // Match by config_key; fall back to name for rows seeded before config_key
    // existed (they get the key backfilled here, but are otherwise left as-is).
    let existing = sqlite.prepare("SELECT id FROM categories WHERE config_key = ?").get(def.key) as { id: number } | undefined;
    if (!existing) {
      existing = sqlite.prepare("SELECT id FROM categories WHERE name = ? AND is_default = 1 AND config_key IS NULL").get(def.name) as { id: number } | undefined;
      if (existing) sqlite.prepare("UPDATE categories SET config_key = ? WHERE id = ?").run(def.key, existing.id);
    }

    let categoryId: number;
    if (!existing) {
      // INSERT OR IGNORE so a pre-existing row with the same (name, "group") — e.g. left
      // over from an earlier config revision under a different config_key — doesn't crash
      // the whole sync on the UNIQUE(name, "group") constraint.
      const res = sqlite.prepare(`
        INSERT OR IGNORE INTO categories (name, "group", budget_type, color, icon, is_default, config_key)
        VALUES (?, '', ?, ?, ?, 1, ?)
      `).run(def.name, def.budgetType, def.color, def.icon, def.key);
      if (res.changes > 0) {
        categoryId = Number(res.lastInsertRowid);
        newlyCreated.add(categoryId);
      } else {
        // Collision: adopt the existing category for this config entry (claim its
        // config_key) instead of inserting a duplicate.
        const row = sqlite.prepare(`SELECT id FROM categories WHERE name = ? AND "group" = ''`).get(def.name) as { id: number };
        categoryId = row.id;
        sqlite.prepare(`UPDATE categories SET config_key = ?, is_default = 1 WHERE id = ?`).run(def.key, categoryId);
      }
      // Seed this freshly-created category's matchingPatterns as real category_rules
      // rows, same shape a user-created rule would have — only runs once, on the boot
      // that first inserts the category, so later edits to matchingPatterns here don't
      // retroactively touch already-seeded rules.
      if (def.matchingPatterns?.length) {
        const insertRule = sqlite.prepare(`
          INSERT INTO category_rules (category_id, name_pattern, name_wildcard, name_whole_word, direction)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const raw of def.matchingPatterns) {
          const { pattern, match, direction } = normalizeMatchingPattern(raw);
          insertRule.run(categoryId, pattern, match !== "exact" ? 1 : 0, match === "word" ? 1 : 0, direction);
        }
      }
    } else {
      categoryId = existing.id;
    }
    idsByKey.set(def.key, categoryId);
  }

  // Second pass: resolve parentKey -> parent_category_id for freshly-created rows only
  // (an existing category's parent may have been changed by the user). Capped at 2
  // levels: a parentKey pointing at an entry that itself has a parent is ignored.
  const setParent = sqlite.prepare("UPDATE categories SET parent_category_id = ? WHERE id = ?");
  for (const def of DEFAULT_CATEGORIES) {
    const categoryId = idsByKey.get(def.key)!;
    if (!newlyCreated.has(categoryId) || !def.parentKey) continue;
    const parent = DEFAULT_CATEGORIES.find((d) => d.key === def.parentKey);
    if (!parent) {
      console.error(`[config-sync] category "${def.key}" has unknown parentKey "${def.parentKey}"`);
      continue;
    }
    if (parent.parentKey) {
      console.error(`[config-sync] category "${def.key}" points at "${def.parentKey}", which itself has a parent — nesting is capped at 2 levels, ignoring`);
      continue;
    }
    setParent.run(idsByKey.get(def.parentKey)!, categoryId);
  }

  applyDefaultCategoryRulesSync(sqlite);
}

/**
 * Ensures every default sub-category is linked to its parent (parentKey -> parent_category_id).
 * Idempotent and safe to run on every boot: it only fills a NULL parent, so a user who
 * deliberately re-parented a default category is never overridden. Nesting is capped at 2
 * levels — a parentKey pointing at an entry that itself has a parent is skipped.
 */
function backfillDefaultParents(sqlite: Database) {
  const idByKey = new Map<string, number>();
  for (const r of sqlite.prepare(`SELECT id, config_key FROM categories WHERE config_key IS NOT NULL`).all() as { id: number; config_key: string }[]) {
    idByKey.set(r.config_key, r.id);
  }
  const setParent = sqlite.prepare(`UPDATE categories SET parent_category_id = ? WHERE id = ? AND parent_category_id IS NULL`);
  for (const def of DEFAULT_CATEGORIES) {
    if (!def.parentKey) continue;
    const parent = DEFAULT_CATEGORIES.find((d) => d.key === def.parentKey);
    if (!parent || parent.parentKey) continue;
    const childId = idByKey.get(def.key);
    const parentId = idByKey.get(def.parentKey);
    if (childId && parentId) setParent.run(parentId, childId);
  }
}

function loadBanksByAccountNumber(sqlite: Database): Map<string, Bank> {
  const allBanks = sqlite.prepare("SELECT * FROM banks").all() as { id: number; account_number: string | null; display_name: string | null }[];
  const banksByAccountNumber = new Map<string, Bank>();
  for (const bank of allBanks) {
    if (bank.account_number) banksByAccountNumber.set(bank.account_number, { id: bank.id, accountNumber: bank.account_number, displayName: bank.display_name } as Bank);
  }
  return banksByAccountNumber;
}

/**
 * Applies config-managed (is_default) category rules — and only those — sharing
 * matchRules() with the general apply path. Unlike applyAllRules(), this ignores
 * manually_categorized: these categories are config-authoritative, so a user
 * clearing/reassigning one shouldn't permanently opt it out of future config
 * changes. It still never touches a transaction currently owned by a genuine
 * user-created (non-default) category — that's a real manual choice and stays put.
 */
function applyDefaultCategoryRulesSync(sqlite: Database) {
  const rules = sqlite.prepare(`
    SELECT r.id, r.category_id AS categoryId, r.name_pattern AS namePattern, r.name_wildcard AS nameWildcard,
           r.name_whole_word AS nameWholeWord, r.amount, r.direction, r.bank_id AS bankId, r.created_at AS createdAt
    FROM category_rules r JOIN categories c ON c.id = r.category_id WHERE c.is_default = 1
  `).all() as CategoryRule[];
  if (rules.length === 0) return;

  const banksByAccountNumber = loadBanksByAccountNumber(sqlite);
  const defaultCategoryIds = new Set((sqlite.prepare("SELECT id FROM categories WHERE is_default = 1").all() as { id: number }[]).map((r) => r.id));
  const splitIds = new Set((sqlite.prepare("SELECT DISTINCT transaction_id FROM transaction_splits").all() as { transaction_id: number }[]).map((r) => r.transaction_id));

  const rows = sqlite.prepare("SELECT id, description, amount, category_id, direction, account FROM transactions").all() as
    { id: number; description: string; amount: number; category_id: number | null; direction: string; account: string | null }[];

  const update = sqlite.prepare("UPDATE transactions SET category_id = ? WHERE id = ?");
  for (const row of rows) {
    if (splitIds.has(row.id)) continue;
    // Never override a transaction the user filed under a real, non-default category.
    if (row.category_id != null && !defaultCategoryIds.has(row.category_id)) continue;
    const newCategoryId = matchRules(row.description, row.amount, row.direction, row.account, rules, banksByAccountNumber);
    if (newCategoryId !== row.category_id) update.run(newCategoryId, row.id);
  }
}

/** Synchronous equivalent of applyAllBrandRules() (src/lib/apply-brand-rules.ts), sharing its matchBrandRules(). */
function applyBrandRulesSync(sqlite: Database) {
  const rules = sqlite.prepare(`
    SELECT id, name_pattern AS namePattern, name_wildcard AS nameWildcard, name_whole_word AS nameWholeWord,
           brand_icon AS brandIcon, icon_color AS iconColor, icon_bg_color AS iconBgColor
    FROM brand_icon_rules
  `).all() as BrandIconRule[];

  const rows = sqlite.prepare("SELECT id, description, brand_icon, brand_icon_color, brand_icon_bg_color FROM transactions").all() as
    { id: number; description: string; brand_icon: string | null; brand_icon_color: string | null; brand_icon_bg_color: string | null }[];

  const update = sqlite.prepare("UPDATE transactions SET brand_icon = ?, brand_icon_color = ?, brand_icon_bg_color = ? WHERE id = ?");
  for (const row of rows) {
    const match = matchBrandRules(row.description, rules);
    const newIcon = match?.brandIcon ?? null;
    const newColor = match?.iconColor ?? null;
    const newBg = match?.iconBgColor ?? null;
    if (newIcon !== row.brand_icon || newColor !== row.brand_icon_color || newBg !== row.brand_icon_bg_color) {
      update.run(newIcon, newColor, newBg, row.id);
    }
  }
}

/**
 * Detects an edit to src/config/categories.ts or src/config/brandIcons.ts (via a
 * content hash stored in app_settings) and re-applies it — otherwise a config change
 * only takes effect for brand-new data, leaving already-imported transactions stuck
 * with whatever was computed last time. Each section fails independently and loudly
 * (logged, hash not advanced) so one bad section can't silently disable the other.
 */
export function runConfigSync(sqlite: Database) {
  sqlite.exec("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)");

  try {
    const categoriesHash = hashOf(DEFAULT_CATEGORIES);
    if (getSetting(sqlite, "default_categories_config_hash") !== categoriesHash) {
      syncDefaultCategories(sqlite);
      setSetting(sqlite, "default_categories_config_hash", categoriesHash);
    }
  } catch (err) {
    console.error("[config-sync] default categories sync failed:", err);
  }

  // Runs on EVERY boot, outside the hash gate above, so a database seeded flat by an
  // older image (whose db:init didn't set parents) heals itself without needing the
  // config to change or the volume to be reset.
  try {
    backfillDefaultParents(sqlite);
  } catch (err) {
    console.error("[config-sync] default parent backfill failed:", err);
  }

  try {
    const brandIconsHash = hashOf(DEFAULT_BRAND_ICONS);
    if (getSetting(sqlite, "brand_icons_config_hash") !== brandIconsHash) {
      applyBrandRulesSync(sqlite);
      setSetting(sqlite, "brand_icons_config_hash", brandIconsHash);
    }
  } catch (err) {
    console.error("[config-sync] brand icons sync failed:", err);
  }
}

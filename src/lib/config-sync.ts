import crypto from "crypto";
import type { Database } from "better-sqlite3";
import { DEFAULT_CATEGORIES, defaultCategoryKind, normalizeMatchingPattern } from "@/config/categories";
import { matchRules } from "@/lib/apply-rules";
import type { CategoryRule, Bank } from "@/db/schema";

// Runs synchronously (raw better-sqlite3, no drizzle) from src/db/index.ts module
// init, so it's guaranteed to finish before ANY query in the app — layouts and pages
// render in parallel in Next, so an async sync awaited in the layout still races the
// page's own queries and the first render shows stale data. Because every page
// (transitively) imports the db module, and a config file edit reloads that module
// graph in dev, changes to src/config/*.ts are visible on the very next request.

function hashOf(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Set once the default categories have been seeded (first run); they never are again. */
const SEEDED_KEY = "default_categories_seeded";

function getSetting(sqlite: Database, key: string): string | null {
  const row = sqlite.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string | null } | undefined;
  return row?.value ?? null;
}

function setSetting(sqlite: Database, key: string, value: string) {
  sqlite.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

/**
 * Seeds src/config/categories.ts: each entry is inserted by its stable `key` (stored in
 * categories.config_key) only if no row with that key exists yet, with its
 * matchingPatterns as rules. Called only for the first-run seed (see runConfigSync) and
 * the explicit "reset to defaults" — never on a later boot, so a default category the
 * user deleted stays deleted and a new entry in a later release isn't added either.
 */
function syncDefaultCategories(sqlite: Database) {
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
        INSERT OR IGNORE INTO categories (name, "group", budget_type, color, icon, is_default, config_key, is_group)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `).run(def.name, defaultCategoryKind(def), def.budgetType, def.color, def.icon, def.key, def.parentKey ? 0 : 1);
      if (res.changes > 0) {
        categoryId = Number(res.lastInsertRowid);
        newlyCreated.add(categoryId);
      } else {
        // Collision: adopt the existing category for this config entry (claim its
        // config_key) instead of inserting a duplicate.
        const row = sqlite.prepare(`SELECT id FROM categories WHERE name = ? AND "group" = ?`).get(def.name, defaultCategoryKind(def)) as { id: number };
        categoryId = row.id;
        sqlite.prepare(`UPDATE categories SET config_key = ?, is_default = 1 WHERE id = ?`).run(def.key, categoryId);
      }
      // Seed this freshly-created category's matchingPatterns as real category_rules
      // rows, same shape a user-created rule would have — only runs once, on the boot
      // that first inserts the category, so later edits to matchingPatterns here don't
      // retroactively touch already-seeded rules. Never for an adopted category: it
      // already has its rules (seeded under its old key, or the user's own), and
      // seeding again would copy every one of them.
      if (newlyCreated.has(categoryId) && def.matchingPatterns?.length) {
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
 * Wipes every category (default *and* user-created) and re-seeds the set defined in
 * src/config/categories.ts from scratch — the "reset to defaults" action in the
 * category settings panel.
 *
 * Transactions are never deleted: categories.id is referenced by transactions with
 * ON DELETE CASCADE, so the links are nulled *before* the delete. Recurring items are
 * likewise unlinked (their FK cascades too) rather than removed. Splits, goals and
 * budget targets lose their category link as well; there's no way to remap a
 * user-created category onto a config entry. Transactions are re-categorized by the
 * freshly seeded default rules at the end (applyDefaultCategoryRulesSync, called from
 * syncDefaultCategories).
 */
export function resetDefaultCategories(sqlite: Database) {
  const run = sqlite.transaction(() => {
    sqlite.prepare("UPDATE transactions SET category_id = NULL").run();
    sqlite.prepare("UPDATE transaction_splits SET category_id = NULL").run();
    sqlite.prepare("UPDATE recurring_items SET category_id = NULL").run();
    sqlite.prepare("UPDATE goals SET category_id = NULL").run();
    sqlite.prepare("UPDATE categories SET parent_category_id = NULL").run();
    sqlite.prepare("DELETE FROM budget_targets").run();
    sqlite.prepare("DELETE FROM category_rules").run();
    sqlite.prepare("DELETE FROM categories").run();

    syncDefaultCategories(sqlite);
    backfillDefaultParents(sqlite);
    setSetting(sqlite, SEEDED_KEY, "1");
  });
  run();
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
export function applyDefaultCategoryRulesSync(sqlite: Database) {
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

/**
 * Seeds the default categories on the first run (only then) and repairs rules and
 * parent links on every boot. Each section fails independently and loudly (logged,
 * flag not advanced) so one bad section can't silently disable the other.
 */
export function runConfigSync(sqlite: Database) {
  sqlite.exec("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)");

  // Repair, every boot: drop rules whose category no longer exists (deletes done while
  // foreign keys were off left dangling rows — they're invisible in the UI and made
  // every rule application fail with an FK error).
  try {
    sqlite.prepare("DELETE FROM category_rules WHERE category_id NOT IN (SELECT id FROM categories)").run();
  } catch (err) {
    console.error("[config-sync] dangling rule cleanup failed:", err);
  }

  // Default categories are seeded on the first run only. An existing database (it has
  // categories, or ran the old hash-gated sync) is marked as seeded without adding
  // anything, so updating the app never brings back a default the user deleted.
  try {
    if (getSetting(sqlite, SEEDED_KEY) === null) {
      const { c } = sqlite.prepare("SELECT COUNT(*) AS c FROM categories").get() as { c: number };
      const existing = c > 0 || getSetting(sqlite, "default_categories_config_hash") !== null;
      sqlite.transaction(() => {
        if (!existing) syncDefaultCategories(sqlite);
        setSetting(sqlite, SEEDED_KEY, "1");
      })();
    }
  } catch (err) {
    console.error("[config-sync] default categories seed failed:", err);
  }

  // Runs on EVERY boot, outside the hash gate above, so a database seeded flat by an
  // older image (whose db:init didn't set parents) heals itself without needing the
  // config to change or the volume to be reset.
  try {
    backfillDefaultParents(sqlite);
  } catch (err) {
    console.error("[config-sync] default parent backfill failed:", err);
  }
}

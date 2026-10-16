import type { Database } from "better-sqlite3";

// Category groups: two levels everywhere. A group (Housing, Transportation…) is a
// top-level category row with is_group = 1. It holds categories and adds them up, and
// is never put on a transaction, split, rule, recurring item, debt or goal itself.
// Budgets may sit on a group (one amount for everything in it) or on a category.
//
// Runs synchronously at db init (src/db/index.ts), after the config sync. The one-time
// part turns an existing database's top-level categories into groups:
//   • a top-level category with sub-categories becomes their group. Anything booked on
//     it directly (transactions, rules, recurring items…) moves to a new category
//     "Other <name>" in that group, so nothing loses its category. Its budget stays on
//     the group, where it already covered the sub-categories.
//   • a top-level category without sub-categories moves into the "Other" group (seeded
//     from src/config/categories.ts), keeping its id and everything linked to it.
// The every-boot part only repairs: any category that has categories under it is a group.

const DONE_KEY = "category_groups_migrated";

/** Tables whose category_id must point at a category, never at a group. */
const ASSIGNABLE_REFS = [
  "transactions",
  "transaction_splits",
  "recurring_items",
  "category_rules",
  "debts",
  "goals",
  "variable_prognose_overrides",
] as const;

interface Row {
  id: number;
  name: string;
  group: string;
  budget_type: string | null;
  color: string | null;
  icon: string | null;
  config_key: string | null;
  exclude_from_spending_row: number;
}

function tableExists(sqlite: Database, table: string) {
  return !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
}

export function migrateCategoryGroups(sqlite: Database) {
  sqlite.exec("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)");
  const done = sqlite.prepare("SELECT value FROM app_settings WHERE key = ?").get(DONE_KEY) as { value: string } | undefined;

  try {
    if (!done) sqlite.transaction(() => migrateOnce(sqlite))();
  } catch (err) {
    console.error("[category-groups] migration failed:", err);
    return;
  }

  // Repair on every boot: a category with categories under it is a group.
  sqlite.exec(`UPDATE categories SET is_group = 1 WHERE is_group = 0 AND id IN (SELECT parent_category_id FROM categories WHERE parent_category_id IS NOT NULL)`);
}

function migrateOnce(sqlite: Database) {
  const refs = ASSIGNABLE_REFS.filter((t) => tableExists(sqlite, t));
  const directRefs = (id: number) =>
    refs.reduce((n, t) => n + (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE category_id = ?`).get(id) as { n: number }).n, 0);
  const childCount = (id: number) =>
    (sqlite.prepare("SELECT COUNT(*) AS n FROM categories WHERE parent_category_id = ?").get(id) as { n: number }).n;
  const markGroup = sqlite.prepare("UPDATE categories SET is_group = 1, parent_category_id = NULL WHERE id = ?");

  // The "Other" group: the seeded one, else one made here.
  let other = sqlite.prepare("SELECT id FROM categories WHERE config_key = 'Other' AND parent_category_id IS NULL").get() as { id: number } | undefined;
  if (!other) {
    const name = sqlite.prepare("SELECT 1 FROM categories WHERE name = 'Other' AND \"group\" = ''").get() ? "Other categories" : "Other";
    const res = sqlite.prepare(`INSERT INTO categories (name, "group", budget_type, color, icon, is_default, is_group) VALUES (?, '', 'willen', '#8a8a96', 'IconCategoryFilled', 0, 1)`).run(name);
    other = { id: Number(res.lastInsertRowid) };
  }
  markGroup.run(other.id);
  const otherColor = (sqlite.prepare("SELECT color FROM categories WHERE id = ?").get(other.id) as { color: string | null }).color;

  const tops = sqlite.prepare(`SELECT id, name, "group", budget_type, color, icon, config_key, exclude_from_spending_row FROM categories WHERE parent_category_id IS NULL AND id != ?`).all(other.id) as Row[];

  for (const top of tops) {
    if (childCount(top.id) > 0) {
      markGroup.run(top.id);
      if (directRefs(top.id) > 0) {
        // Its own bookings move to a new category inside it.
        let name = `Other ${top.name}`;
        for (let n = 2; sqlite.prepare(`SELECT 1 FROM categories WHERE name = ? AND "group" = ?`).get(name, top.group); n++) name = `Other ${top.name} ${n}`;
        const res = sqlite.prepare(`
          INSERT INTO categories (name, "group", budget_type, color, icon, is_default, parent_category_id, exclude_from_spending_row, is_group)
          VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0)
        `).run(name, top.group, top.budget_type, top.color, top.icon, top.id, top.exclude_from_spending_row);
        const leafId = Number(res.lastInsertRowid);
        for (const t of refs) sqlite.prepare(`UPDATE ${t} SET category_id = ? WHERE category_id = ?`).run(leafId, top.id);
      }
      // A group whose categories are all income (or all savings) counts as that.
      if (!top.group) {
        const kinds = sqlite.prepare(`SELECT DISTINCT "group" AS kind FROM categories WHERE parent_category_id = ?`).all(top.id) as { kind: string }[];
        const only = kinds.length === 1 ? kinds[0].kind : "";
        if (only === "income" || only === "savings") {
          const clash = sqlite.prepare(`SELECT 1 FROM categories WHERE name = ? AND "group" = ? AND id != ?`).get(top.name, only, top.id);
          if (!clash) sqlite.prepare(`UPDATE categories SET "group" = ? WHERE id = ?`).run(only, top.id);
        }
      }
    } else {
      // A lone category joins the Other group and takes its colour, like every category.
      sqlite.prepare("UPDATE categories SET parent_category_id = ?, color = COALESCE(?, color), is_group = 0 WHERE id = ?").run(other.id, otherColor, top.id);
    }
  }

  // Categories always show their group's colour; store it too, so code that reads the
  // colour straight from the row agrees.
  sqlite.exec(`
    UPDATE categories SET color = (SELECT g.color FROM categories g WHERE g.id = categories.parent_category_id)
    WHERE parent_category_id IS NOT NULL AND (SELECT g.color FROM categories g WHERE g.id = categories.parent_category_id) IS NOT NULL
  `);

  sqlite.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(DONE_KEY, new Date().toISOString());
}

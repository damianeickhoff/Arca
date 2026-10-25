import type { Database } from "better-sqlite3";
import { DEFAULT_CATEGORIES, defaultCategoryKind } from "@/config/categories";

// Category kinds (categories.group: "income", "savings" or "" for spending) arrived after
// many databases were seeded, and the seed only writes them on the first run, so those
// databases have every category as spending: salary in the Income group, transfers to a
// savings account and investment deposits all counted as spending on Insights, Trends and
// the financial health score. This one-time pass gives every default category that still
// has no kind the kind src/config/categories.ts gives it, then lets a category the user
// made inside a group take that group's kind. A kind the user set stays; a category that
// would clash with one of the same name and kind (UNIQUE(name, "group")) is left as it is.
// The seed also had "savings" on Bank Fees instead of Savings; a Bank Fees default still
// marked so goes back to spending. Runs at db init (src/db/index.ts) after the category
// groups migration.

const DONE_KEY = "category_kinds_backfilled";

export function migrateCategoryKinds(sqlite: Database) {
  const done = sqlite.prepare("SELECT value FROM app_settings WHERE key = ?").get(DONE_KEY);
  if (done) return;

  const byKey = new Map(DEFAULT_CATEGORIES.map((d) => [d.key, defaultCategoryKind(d)]));
  const rows = sqlite.prepare(`SELECT id, name, config_key, parent_category_id FROM categories WHERE "group" = ''`).all() as {
    id: number;
    name: string;
    config_key: string | null;
    parent_category_id: number | null;
  }[];
  const clash = sqlite.prepare(`SELECT 1 FROM categories WHERE name = ? AND "group" = ? AND id <> ?`);
  const setKind = sqlite.prepare(`UPDATE categories SET "group" = ? WHERE id = ?`);
  const apply = (row: { id: number; name: string }, kind: string) => {
    if (!kind || clash.get(row.name, kind, row.id)) return;
    setKind.run(kind, row.id);
  };

  try {
    sqlite.transaction(() => {
      const bankFees = sqlite.prepare(`SELECT id, name FROM categories WHERE config_key = 'Bank Fees' AND "group" = 'savings'`).all() as { id: number; name: string }[];
      for (const row of bankFees) if (!clash.get(row.name, "", row.id)) setKind.run("", row.id);
      // Defaults first (groups included), so the groups carry their kind for the next step.
      for (const row of rows) if (row.config_key) apply(row, byKey.get(row.config_key) ?? "");
      const groupKind = sqlite.prepare(`SELECT "group" AS kind FROM categories WHERE id = ?`);
      for (const row of rows) {
        if (row.config_key && byKey.has(row.config_key)) continue;
        if (row.parent_category_id == null) continue;
        const parent = groupKind.get(row.parent_category_id) as { kind: string } | undefined;
        apply(row, parent?.kind ?? "");
      }
      sqlite.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run(DONE_KEY, new Date().toISOString());
    })();
  } catch (err) {
    console.error("[category-kinds] backfill failed:", err);
  }
}

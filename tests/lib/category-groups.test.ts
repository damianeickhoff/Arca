import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateCategoryGroups } from "@/lib/category-groups-migration";

// An old two-level database: top-level categories that are sometimes parents, sometimes
// booked on directly, and lone categories without children.
function oldDatabase() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, "group" TEXT NOT NULL DEFAULT '',
      budget_type TEXT, color TEXT, icon TEXT, is_default INTEGER NOT NULL DEFAULT 0, config_key TEXT,
      parent_category_id INTEGER, exclude_from_spending_row INTEGER NOT NULL DEFAULT 0,
      is_group INTEGER NOT NULL DEFAULT 0, UNIQUE(name, "group")
    );
    CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER);
    CREATE TABLE category_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL);
    CREATE TABLE budget_targets (id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER, month INTEGER, category_id INTEGER, target_amount REAL);
  `);
  const cat = sqlite.prepare(`INSERT INTO categories (name, "group", budget_type, color, parent_category_id) VALUES (?, ?, ?, ?, ?)`);
  const housing = Number(cat.run("Housing", "", "nodig", "#111111", null).lastInsertRowid);
  const utilities = Number(cat.run("Utilities", "", "nodig", "#999999", housing).lastInsertRowid);
  const income = Number(cat.run("Income", "", "nodig", "#222222", null).lastInsertRowid);
  cat.run("Salary", "income", null, "#222222", income);
  const gifts = Number(cat.run("Gifts", "", "willen", "#333333", null).lastInsertRowid);
  // Rent was booked on Housing itself; a gift on the lone Gifts category.
  sqlite.prepare("INSERT INTO transactions (category_id) VALUES (?), (?), (?)").run(housing, utilities, gifts);
  sqlite.prepare("INSERT INTO category_rules (category_id) VALUES (?)").run(housing);
  sqlite.prepare("INSERT INTO budget_targets (year, month, category_id, target_amount) VALUES (0, 0, ?, 1300)").run(housing);
  return { sqlite, housing, utilities, income, gifts };
}

type Row = { id: number; name: string; group: string; color: string | null; parent_category_id: number | null; is_group: number };

describe("category groups migration", () => {
  it("turns parents into groups and moves what was booked on them", () => {
    const { sqlite, housing, utilities, income, gifts } = oldDatabase();
    migrateCategoryGroups(sqlite);
    const rows = sqlite.prepare(`SELECT id, name, "group", color, parent_category_id, is_group FROM categories`).all() as Row[];
    const byName = new Map(rows.map((r) => [r.name, r]));

    // Housing is a group now; its own rent moved into "Other Housing" inside it.
    expect(byName.get("Housing")!.is_group).toBe(1);
    const otherHousing = byName.get("Other Housing")!;
    expect(otherHousing.parent_category_id).toBe(housing);
    expect(otherHousing.is_group).toBe(0);
    const txCategories = (sqlite.prepare("SELECT category_id AS c FROM transactions ORDER BY id").all() as { c: number }[]).map((r) => r.c);
    expect(txCategories).toEqual([otherHousing.id, utilities, gifts]);
    expect((sqlite.prepare("SELECT category_id AS c FROM category_rules").get() as { c: number }).c).toBe(otherHousing.id);
    // The Housing budget stays on the group, where it already covered Utilities.
    expect((sqlite.prepare("SELECT category_id AS c FROM budget_targets").get() as { c: number }).c).toBe(housing);

    // A group of income categories counts as income.
    expect(byName.get("Income")!.group).toBe("income");
    expect(byName.get("Income")!.id).toBe(income);

    // A lone category joins the Other group, keeps its id and takes the group's colour.
    const other = rows.find((r) => r.is_group === 1 && r.name === "Other")!;
    expect(byName.get("Gifts")!.parent_category_id).toBe(other.id);
    expect(byName.get("Gifts")!.color).toBe("#8a8a96");
    expect(byName.get("Utilities")!.color).toBe("#111111");

    // Nothing is left outside a group, and nothing is booked on a group.
    expect(rows.filter((r) => r.is_group === 0 && r.parent_category_id == null)).toEqual([]);
    const groupIds = new Set(rows.filter((r) => r.is_group === 1).map((r) => r.id));
    expect(txCategories.some((c) => groupIds.has(c))).toBe(false);
  });

  it("runs once", () => {
    const { sqlite } = oldDatabase();
    migrateCategoryGroups(sqlite);
    const count = () => (sqlite.prepare("SELECT COUNT(*) AS n FROM categories").get() as { n: number }).n;
    const before = count();
    migrateCategoryGroups(sqlite);
    expect(count()).toBe(before);
  });
});

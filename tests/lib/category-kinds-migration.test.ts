// The one-time kinds backfill (lib/category-kinds-migration.ts) on a database seeded
// before categories had a kind: defaults get theirs, a user category takes its group's,
// a kind the user set stays, and the pass runs once.
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrateCategoryKinds } from "@/lib/category-kinds-migration";

function seeded() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, "group" TEXT NOT NULL DEFAULT '', config_key TEXT, parent_category_id INTEGER, UNIQUE(name, "group"));
    INSERT INTO categories (id, name, "group", config_key, parent_category_id) VALUES
      (1, 'Income', '', 'Income', NULL),
      (2, 'Salary', '', 'Salary', 1),
      (3, 'Side gig', '', NULL, 1),
      (4, 'Finance', '', 'Finance', NULL),
      (5, 'Savings', '', 'Savings', 4),
      (6, 'Investments', '', 'Investments', 4),
      (7, 'Bank Fees', 'savings', 'Bank Fees', 4),
      (8, 'Groceries', '', 'Groceries', NULL),
      (9, 'Tips', 'income', NULL, 4);
  `);
  return sqlite;
}

const kinds = (sqlite: Database.Database) =>
  Object.fromEntries((sqlite.prepare(`SELECT name, "group" AS kind FROM categories`).all() as { name: string; kind: string }[]).map((r) => [r.name, r.kind]));

describe("migrateCategoryKinds", () => {
  it("gives defaults their kind and user categories their group's", () => {
    const sqlite = seeded();
    migrateCategoryKinds(sqlite);
    expect(kinds(sqlite)).toEqual({
      Income: "income",
      Salary: "income",
      "Side gig": "income",
      Finance: "",
      Savings: "savings",
      Investments: "savings",
      "Bank Fees": "",
      Groceries: "",
      Tips: "income", // set by the user, kept
    });
  });

  it("runs once", () => {
    const sqlite = seeded();
    migrateCategoryKinds(sqlite);
    sqlite.exec(`UPDATE categories SET "group" = '' WHERE name = 'Salary'`);
    migrateCategoryKinds(sqlite);
    expect(kinds(sqlite).Salary).toBe("");
  });
});

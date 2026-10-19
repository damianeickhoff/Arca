import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Creates the schema in this test file's temporary database by running the real
 * `npm run db:init` script (src/db/migrate.ts) against it. Call it in beforeAll,
 * before the first query — the runtime auto-migrations in src/db/index.ts then run on
 * top of it exactly as they do on a deployed install.
 */
export function migrateTestDb() {
  execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join("src", "db", "migrate.ts")], {
    env: { ...process.env },
    stdio: "ignore",
  });
}

/**
 * Empties the tables the money logic reads, including the default categories and
 * category rules that the migration seeds — so every test starts from fixtures it
 * created itself and asserts on numbers that don't depend on the seed config.
 */
export async function clearFixtures() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  const tables = [
    "bill_payments",
    "debt_recurring",
    "debts",
    "reimbursements",
    "transaction_splits",
    "transactions",
    "merchants",
    "category_rules",
    "merchant_patterns",
    "budget_targets",
    "budgets",
    "recurring_items",
    "goals",
    "savings_goals",
    "vermogen_accounts",
    "banks",
    "categories",
  ];
  db.run(sql.raw("PRAGMA foreign_keys = OFF"));
  for (const table of tables) db.run(sql.raw(`DELETE FROM ${table}`));
  db.run(sql.raw("DELETE FROM app_settings WHERE key NOT LIKE '%config_hash'"));
  db.run(sql.raw("PRAGMA foreign_keys = ON"));
}

/** Removes the temporary database files once a test file is done with them. */
export function removeTestDb() {
  const file = process.env.DB_PATH;
  if (!file) return;
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(file + suffix, { force: true });
    } catch {
      // Still held open on Windows — it lives in the OS temp dir, so leaving it is harmless.
    }
  }
}

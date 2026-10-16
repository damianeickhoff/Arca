import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// The app on its very first start: DB_PATH points at a file that doesn't exist yet, and
// nobody ran `npm run db:init`. Opening the database must create the whole schema and
// the default categories instead of crashing on a missing `transactions` table.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "centje-first-run-"));
const dbPath = path.join(dir, "finance.db");

describe("first run without db:init", () => {
  afterAll(() => {
    // Best effort: on Windows the still-open SQLite file can't be removed until the
    // worker exits; the OS temp folder gets cleaned up eventually anyway.
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* file still in use */
    }
  });

  it("creates the schema and seeds the default categories", async () => {
    process.env.DB_PATH = dbPath;
    const { db, schema } = await import("@/db");
    const categories = await db.select().from(schema.categories);
    expect(categories.length).toBeGreaterThan(0);
    const transactions = await db.select().from(schema.transactions);
    expect(transactions).toEqual([]);
    // Two levels: every category sits in a group, and the income group counts as income.
    const groupIds = new Set(categories.filter((c) => c.isGroup).map((c) => c.id));
    expect(groupIds.size).toBeGreaterThan(0);
    expect(categories.filter((c) => !c.isGroup && (c.parentCategoryId == null || !groupIds.has(c.parentCategoryId)))).toEqual([]);
    const salary = categories.find((c) => c.configKey === "Salary");
    expect(salary?.group).toBe("income");
  });
});

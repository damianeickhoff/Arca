// The change log's undo engine against a real, throwaway database (tests/setup.ts):
// an import undone around an edited row, the conflict refusal, and a category delete
// put back with everything it took along.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateTestDb, clearFixtures, removeTestDb } from "../helpers/test-db";

beforeAll(() => migrateTestDb());
afterAll(() => removeTestDb());

async function setup() {
  await clearFixtures();
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const { sql } = await import("drizzle-orm");
  db.run(sql.raw("DELETE FROM activity_log"));
  const [group] = await db.insert(s.categories).values({ name: "T Daily", isGroup: true }).returning();
  const [groceries] = await db.insert(s.categories).values({ name: "T Groceries", parentCategoryId: group.id }).returning();
  const [fun] = await db.insert(s.categories).values({ name: "T Fun", parentCategoryId: group.id }).returning();
  const rows = await db
    .insert(s.transactions)
    .values([1, 2, 3].map((n) => ({ date: `2026-10-0${n}`, direction: "expense", type: "variabel", amount: n * 10, description: `Shop ${n}`, categoryId: groceries.id, source: "csv_import" })))
    .returning({ id: s.transactions.id });
  return { db, s, groceries, fun, ids: rows.map((r) => r.id) };
}

describe("undoActivity", () => {
  beforeEach(async () => {
    const { db } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    db.run(sql.raw("DELETE FROM activity_log"));
  });

  it("removes imported rows but keeps the ones edited since", async () => {
    const { db, s, ids } = await setup();
    const { recordImport, undoActivity } = await import("@/lib/activity-log");
    const { eq } = await import("drizzle-orm");
    const entryId = (await recordImport("csvImport", ids))!;
    await db.update(s.transactions).set({ notes: "keep me" }).where(eq(s.transactions.id, ids[0]));

    const result = await undoActivity(entryId);
    expect(result).toEqual({ ok: true, restored: 2, kept: 1 });
    const left = await db.select({ id: s.transactions.id }).from(s.transactions);
    expect(left.map((r) => r.id)).toEqual([ids[0]]);
    expect(await undoActivity(entryId)).toEqual({ ok: false, reason: "alreadyUndone" });
  });

  it("refuses while a later change touched the same rows, then goes through", async () => {
    const { db, s, ids, groceries, fun } = await setup();
    const { recordActivity, recordImport, undoActivity } = await import("@/lib/activity-log");
    const { rulePassEntry } = await import("@/lib/activity-log-entries");
    const { eq } = await import("drizzle-orm");
    const importId = (await recordImport("csvImport", ids))!;

    await db.update(s.transactions).set({ categoryId: fun.id }).where(eq(s.transactions.id, ids[1]));
    const moveId = (await recordActivity(rulePassEntry([{ id: ids[1], before: { categoryId: groceries.id }, patch: { categoryId: fun.id } }]), null))!;

    const refused = await undoActivity(importId);
    expect(refused).toMatchObject({ ok: false, reason: "conflict", conflict: { id: moveId, kind: "rulesApplied" } });
    expect(await db.select().from(s.transactions)).toHaveLength(3);

    expect(await undoActivity(moveId)).toEqual({ ok: true, restored: 1, kept: 0 });
    const [moved] = await db.select().from(s.transactions).where(eq(s.transactions.id, ids[1]));
    expect(moved.categoryId).toBe(groceries.id);

    // Back to its imported state, so the import undo removes all three.
    expect(await undoActivity(importId)).toEqual({ ok: true, restored: 3, kept: 0 });
  });

  it("puts a deleted category back with its rules, transactions and split links", async () => {
    const { db, s, ids, groceries, fun } = await setup();
    const { recordActivity, snapshotDelete, undoActivity } = await import("@/lib/activity-log");
    const { categoryDeletedEntry } = await import("@/lib/activity-log-entries");
    const { eq } = await import("drizzle-orm");
    const [rule] = await db.insert(s.categoryRules).values({ categoryId: groceries.id, namePattern: "shop" }).returning();
    // A split on a Fun transaction that points at Groceries: cleared, not deleted.
    const [other] = await db.insert(s.transactions).values({ date: "2026-10-05", direction: "expense", type: "variabel", amount: 8, description: "Mixed", categoryId: fun.id }).returning();
    const [split] = await db.insert(s.transactionSplits).values({ transactionId: other.id, categoryId: groceries.id, amount: 8 }).returning();

    const snapshot = db.transaction((tx) => {
      const taken = snapshotDelete("categories", [groceries.id]);
      tx.delete(s.categoryRules).where(eq(s.categoryRules.categoryId, groceries.id)).run();
      tx.update(s.transactionSplits).set({ categoryId: null }).where(eq(s.transactionSplits.categoryId, groceries.id)).run();
      tx.delete(s.transactions).where(eq(s.transactions.categoryId, groceries.id)).run();
      tx.delete(s.categories).where(eq(s.categories.id, groceries.id)).run();
      return taken;
    });
    const entry = categoryDeletedEntry(snapshot)!;
    expect(entry.params).toMatchObject({ name: "T Groceries", transactions: 3, rules: 1 });
    const entryId = (await recordActivity(entry, null))!;

    const result = await undoActivity(entryId);
    expect(result.ok).toBe(true);
    expect((await db.select().from(s.categories).where(eq(s.categories.id, groceries.id)))[0]?.name).toBe("T Groceries");
    expect((await db.select().from(s.categoryRules).where(eq(s.categoryRules.id, rule.id)))[0]?.namePattern).toBe("shop");
    const back = await db.select({ id: s.transactions.id }).from(s.transactions).where(eq(s.transactions.categoryId, groceries.id));
    expect(back.map((r) => r.id).sort()).toEqual([...ids].sort());
    expect((await db.select().from(s.transactionSplits).where(eq(s.transactionSplits.id, split.id)))[0]?.categoryId).toBe(groceries.id);
  });

  it("keeps only the newest entries", async () => {
    const { recordActivity, listActivity, ACTIVITY_LOG_LIMIT } = await import("@/lib/activity-log");
    const { ruleCreatedEntry } = await import("@/lib/activity-log-entries");
    for (let i = 0; i < ACTIVITY_LOG_LIMIT + 3; i++) await recordActivity(ruleCreatedEntry({ id: i + 1, name_pattern: `p${i}` }, null), null);
    const all = listActivity(ACTIVITY_LOG_LIMIT + 10);
    expect(all).toHaveLength(ACTIVITY_LOG_LIMIT);
    expect(all[0].params.pattern).toBe(`p${ACTIVITY_LOG_LIMIT + 2}`);
    expect(all[0].reversible).toBe(true);
  });
});

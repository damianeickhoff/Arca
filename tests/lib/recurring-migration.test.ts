// The one-time re-test of the old detector's items (lib/recurring-migration.ts) against
// a real temporary database: items that pass stay (and get their real rhythm), items
// that fail are switched off and listed for review, the pass runs once, it is undoable,
// and Keep / Remove resolve the review.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { migrateTestDb, clearFixtures, removeTestDb } from "../helpers/test-db";
import { groceries, salary } from "../helpers/recurring-fixtures";
import type { DetectTransaction } from "@/lib/recurring-detect";

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date(2026, 9, 15, 12));

const ids: Record<string, number> = {};

async function client(): Promise<Database.Database> {
  const { db } = await import("@/db");
  return (db as unknown as { $client: Database.Database }).$client;
}

async function linked(rows: DetectTransaction[], recurringItemId: number) {
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  for (const r of rows) {
    await db.insert(s.transactions).values({
      date: r.date, direction: r.direction, type: "variabel", amount: Math.abs(r.amount), description: r.description, recurringItemId,
    });
  }
}

beforeAll(async () => {
  migrateTestDb();
  await clearFixtures();
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const item = async (key: string, values: typeof s.recurringItems.$inferInsert) => {
    const [row] = await db.insert(s.recurringItems).values(values).returning();
    ids[key] = row.id;
  };
  // What the old detector made: a monthly "bill" out of grocery trips, and a salary.
  await item("groceries", { name: "Albert Heijn", type: "bill", frequency: "monthly", matchPattern: "albert heijn", amount: 30, source: "auto", signature: "h:albert heijn" });
  await item("salary", { name: "Acme BV", type: "income", frequency: "monthly", matchPattern: "acme bv", amount: 3200, source: "auto", signature: "h:acme bv" });
  // Left alone: a dismissed auto item and a hand-made one.
  await item("dismissed", { name: "Tikkie", type: "bill", frequency: "monthly", matchPattern: "tikkie", source: "auto", active: false, dismissed: true });
  await item("manual", { name: "Gym", type: "bill", frequency: "monthly", matchPattern: "gym", source: "manual" });
  await linked(groceries(), ids.groceries);
  await linked(salary(), ids.salary);
});

afterAll(() => {
  vi.useRealTimers();
  removeTestDb();
});

describe("migrateAutoRecurringItems", () => {
  it("keeps what passes, switches off and lists what fails, and logs the pass", async () => {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { migrateAutoRecurringItems } = await import("@/lib/recurring-migration");
    migrateAutoRecurringItems(await client(), "2026-10-15");

    const items = new Map((await db.select().from(s.recurringItems)).map((i) => [i.id, i]));
    expect(items.get(ids.groceries)).toMatchObject({ active: false, dismissed: false });
    expect(items.get(ids.salary)).toMatchObject({ active: true, frequency: "monthly", dueDay: 25, startDate: "2026-04-25" });
    expect(items.get(ids.dismissed)).toMatchObject({ active: false, dismissed: true });
    expect(items.get(ids.manual)).toMatchObject({ active: true });

    const txns = await db.select().from(s.transactions);
    expect(txns.filter((t) => t.recurringItemId === ids.groceries)).toEqual([]);
    expect(txns.filter((t) => t.recurringItemId === ids.salary)).toHaveLength(6);

    const { listMigrationReview, listPendingSuggestions } = await import("@/lib/recurring-suggestions");
    const review = await listMigrationReview();
    expect(review).toMatchObject([{ name: "Albert Heijn", occurrences: 14 }]);
    expect(await listPendingSuggestions()).toEqual([]);

    const [entry] = await db.select().from(s.activityLog).where(eq(s.activityLog.kind, "recurringMigrated"));
    expect(JSON.parse(entry.params!)).toEqual({ kept: 1, review: 1 });
  });

  it("runs only once", async () => {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { migrateAutoRecurringItems } = await import("@/lib/recurring-migration");
    migrateAutoRecurringItems(await client(), "2026-10-15");
    expect(await db.select().from(s.activityLog).where(eq(s.activityLog.kind, "recurringMigrated"))).toHaveLength(1);
  });

  it("can be undone from the change log", async () => {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { undoActivity } = await import("@/lib/activity-log");
    const [entry] = await db.select().from(s.activityLog).where(eq(s.activityLog.kind, "recurringMigrated"));
    await undoActivity(entry.id);

    const [groceriesItem] = await db.select().from(s.recurringItems).where(eq(s.recurringItems.id, ids.groceries));
    expect(groceriesItem.active).toBe(true);
    const [salaryItem] = await db.select().from(s.recurringItems).where(eq(s.recurringItems.id, ids.salary));
    expect(salaryItem).toMatchObject({ startDate: null });
    expect(await db.select().from(s.recurringSuggestions)).toEqual([]);
  });
});

describe("resolveMigrated", () => {
  it("Keep switches an item back on; Remove dismisses it", async () => {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    // A fresh review row for each outcome.
    const [kept] = await db.insert(s.recurringItems).values({ name: "Kept", type: "bill", source: "auto", active: false }).returning();
    const [gone] = await db.insert(s.recurringItems).values({ name: "Gone", type: "bill", source: "auto", active: false }).returning();
    const row = (item: { id: number; name: string }) => ({
      signature: `legacy:${item.id}`, groupKey: "legacy", name: item.name, type: "bill", frequency: "monthly",
      matchPattern: item.name.toLowerCase(), recurringItemId: item.id, wasActive: true,
    });
    const [keepRow] = await db.insert(s.recurringSuggestions).values(row(kept)).returning();
    await db.insert(s.recurringSuggestions).values(row(gone));

    const { resolveMigrated, listMigrationReview } = await import("@/lib/recurring-suggestions");
    expect(await resolveMigrated(true, [keepRow.id])).toBe(1);
    expect(await resolveMigrated(false)).toBe(1);
    expect(await listMigrationReview()).toEqual([]);

    const items = new Map((await db.select().from(s.recurringItems)).map((i) => [i.name, i]));
    expect(items.get("Kept")).toMatchObject({ active: true, dismissed: false });
    expect(items.get("Gone")).toMatchObject({ active: false, dismissed: true });
  });
});

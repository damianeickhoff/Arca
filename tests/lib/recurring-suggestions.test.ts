// The recurring detector's database half (lib/recurring-suggestions.ts) against a real
// temporary database: suggestions are stored, a curated match is auto-accepted and
// logged, Accept links the payments, Not a bill keeps a series from coming back, and an
// incremental run only re-tests the counterparties it was given.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrateTestDb, clearFixtures, removeTestDb } from "../helpers/test-db";
import { carInsurance, groceries, salary, series, water } from "../helpers/recurring-fixtures";
import type { DetectTransaction } from "@/lib/recurring-detect";

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date(2026, 9, 15, 12));

/** Inserts fixture transactions (and their merchants); returns the new ids by fixture id. */
async function insert(rows: DetectTransaction[]): Promise<number[]> {
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const merchantIds = new Map<number, number>();
  const ids: number[] = [];
  for (const r of rows) {
    let merchantId: number | null = null;
    if (r.merchantId != null) {
      merchantId = merchantIds.get(r.merchantId) ?? null;
      if (merchantId == null) {
        const name = r.merchantName ?? `Merchant ${r.merchantId}`;
        const [m] = await db.insert(s.merchants).values({ name, normalizedKey: name.toLowerCase().replace(/[^a-z0-9]/g, "") }).returning();
        merchantId = m.id;
        merchantIds.set(r.merchantId, m.id);
      }
    }
    const [t] = await db.insert(s.transactions).values({
      date: r.date, direction: r.direction, type: r.direction === "income" ? "inkomen" : "variabel",
      amount: Math.abs(r.amount), description: r.description, merchantId, counterAccount: r.counterAccount ?? null,
    }).returning();
    ids.push(t.id);
  }
  return ids;
}

const netflix = () =>
  series({
    merchantId: 50,
    merchantName: "Netflix",
    description: "NETFLIX.COM",
    dates: ["2026-05-08", "2026-06-08", "2026-07-08", "2026-08-08", "2026-09-08", "2026-10-08"],
    amounts: 13.99,
  });

let groceryIds: number[] = [];
let waterIds: number[] = [];

beforeAll(async () => {
  migrateTestDb();
  await clearFixtures();
  await insert(salary());
  await insert(netflix());
  groceryIds = await insert(groceries());
  waterIds = await insert(water());
});

afterAll(() => {
  vi.useRealTimers();
  removeTestDb();
});

describe("detectRecurringSuggestions", () => {
  it("stores suggestions and auto-accepts a curated, high-confidence match", async () => {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { detectRecurringSuggestions, listPendingSuggestions } = await import("@/lib/recurring-suggestions");

    expect(await detectRecurringSuggestions()).toEqual({ suggested: 2, autoAccepted: 1 });

    const pending = await listPendingSuggestions();
    expect(pending.map((p) => p.name).sort()).toEqual(["Acme BV", "Waterbedrijf Noord"]);

    const items = await db.select().from(s.recurringItems);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Netflix", type: "subscription", source: "auto", active: true, frequency: "monthly" });
    const linked = await db.select().from(s.transactions);
    expect(linked.filter((t) => t.recurringItemId === items[0].id)).toHaveLength(6);

    const log = await db.select().from(s.activityLog);
    expect(log.map((e) => e.kind)).toContain("recurringDetected");
  });

  it("Accept makes the item with the detected rhythm and links its payments", async () => {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { acceptSuggestion, listPendingSuggestions } = await import("@/lib/recurring-suggestions");
    const water = (await listPendingSuggestions()).find((p) => p.name === "Waterbedrijf Noord")!;

    expect(await acceptSuggestion(water.id)).toBe(true);
    const [item] = await db.select().from(s.recurringItems).where(eq(s.recurringItems.name, "Waterbedrijf Noord"));
    expect(item).toMatchObject({ frequency: "quarterly", startDate: "2025-11-08", dueDay: 8, matchAmount: 54.2, active: true });
    const rows = await db.select().from(s.transactions);
    expect(rows.filter((t) => waterIds.includes(t.id)).every((t) => t.recurringItemId === item.id)).toBe(true);
    // Accepting twice does nothing.
    expect(await acceptSuggestion(water.id)).toBe(false);
  });

  it("Not a bill keeps the series from coming back", async () => {
    const { detectRecurringSuggestions, listPendingSuggestions, rejectSuggestion } = await import("@/lib/recurring-suggestions");
    const acme = (await listPendingSuggestions()).find((p) => p.name === "Acme BV")!;
    expect(await rejectSuggestion(acme.id)).toBe(true);

    expect(await detectRecurringSuggestions()).toEqual({ suggested: 0, autoAccepted: 0 });
    expect(await listPendingSuggestions()).toEqual([]);
  });

  it("an incremental run only tests the counterparties it touched", async () => {
    const { detectRecurringSuggestions, listPendingSuggestions } = await import("@/lib/recurring-suggestions");
    await insert(carInsurance());
    // Groceries touched: nothing to find there, and the insurance isn't looked at.
    expect(await detectRecurringSuggestions(groceryIds.slice(0, 1))).toEqual({ suggested: 0, autoAccepted: 0 });
    expect(await listPendingSuggestions()).toEqual([]);
    // A full run finds it.
    expect(await detectRecurringSuggestions()).toEqual({ suggested: 1, autoAccepted: 0 });
  });
});

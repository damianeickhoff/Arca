// Frequency-aware bill tracking (lib/bill-status.ts) against a real temporary database,
// and the shared due-date generator it uses (lib/recurring-occurrence.ts): quarterly and
// yearly items only in their own months, weekly and four-weekly ones once per date, and
// no "No fixed date" rows for auto-detected items.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateTestDb, clearFixtures, removeTestDb } from "../helpers/test-db";
import { nextOccurrence, occurrencesBetween } from "@/lib/recurring-occurrence";
import { toMonthly } from "@/lib/format";

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date(2026, 9, 15, 12));

describe("occurrencesBetween", () => {
  it("places quarterly and yearly items only in their months", () => {
    const water = { frequency: "quarterly", dueDay: 8, startDate: "2025-11-08" };
    expect(occurrencesBetween(water, "2026-10-01", "2026-10-31")).toEqual([]);
    // Sunday 8 November moves to Monday the 9th.
    expect(occurrencesBetween(water, "2026-11-01", "2026-11-30")).toEqual(["2026-11-09"]);
    const insurance = { frequency: "yearly", dueDay: 13, startDate: "2025-03-13" };
    expect(occurrencesBetween(insurance, "2026-01-01", "2026-12-31")).toEqual(["2026-03-13"]);
  });

  it("moves a weekend due date to the Monday after", () => {
    // Saturday 24 and Sunday 25 October 2026 are both paid on Monday the 26th.
    expect(occurrencesBetween({ frequency: "monthly", dueDay: 24 }, "2026-10-01", "2026-10-31")).toEqual(["2026-10-26"]);
    expect(occurrencesBetween({ frequency: "monthly", dueDay: 25 }, "2026-10-01", "2026-10-31")).toEqual(["2026-10-26"]);
    expect(nextOccurrence({ frequency: "monthly", dueDay: 24 }, "2026-10-25")).toBe("2026-10-26");
    expect(nextOccurrence({ frequency: "monthly", dueDay: 24 }, "2026-10-26")).toBe("2026-11-24");
    // Saturday 31 October lands in November (Monday the 2nd), next to Monday 30 November.
    const rent = { frequency: "monthly", dueDay: 31 };
    expect(occurrencesBetween(rent, "2026-10-01", "2026-10-31")).toEqual([]);
    expect(occurrencesBetween(rent, "2026-11-01", "2026-11-30")).toEqual(["2026-11-02", "2026-11-30"]);
    expect(nextOccurrence({ frequency: "once", startDate: "2026-10-31" }, "2026-10-30")).toBe("2026-11-02");
  });

  it("keeps income on its weekend date", () => {
    const salary = { frequency: "monthly", dueDay: 24, type: "income" };
    expect(occurrencesBetween(salary, "2026-10-01", "2026-10-31")).toEqual(["2026-10-24"]);
    expect(nextOccurrence(salary, "2026-10-01")).toBe("2026-10-24");
  });

  it("steps weekly and four-weekly items by days from their start", () => {
    expect(occurrencesBetween({ frequency: "weekly", startDate: "2026-09-01" }, "2026-10-01", "2026-10-31"))
      .toEqual(["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"]);
    expect(occurrencesBetween({ frequency: "four_weekly", startDate: "2026-08-14" }, "2026-10-01", "2026-12-31"))
      .toEqual(["2026-10-09", "2026-11-06", "2026-12-04"]);
    expect(nextOccurrence({ frequency: "four_weekly", startDate: "2026-08-14" }, "2026-10-09")).toBe("2026-11-06");
  });

  it("counts four-weekly as thirteen times a year", () => {
    expect(toMonthly(120, "four_weekly")).toBeCloseTo(130);
  });
});

describe("getBillStatuses", () => {
  beforeAll(async () => {
    migrateTestDb();
    await clearFixtures();
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    await db.insert(s.recurringItems).values([
      { name: "Water", type: "bill", amount: 54.2, frequency: "quarterly", dueDay: 8, startDate: "2025-11-08", matchPattern: "waterbedrijf" },
      { name: "Insurance", type: "bill", amount: 612.4, frequency: "yearly", dueDay: 13, startDate: "2025-03-13", matchPattern: "autoverzekering" },
      { name: "Cleaner", type: "bill", amount: 40, frequency: "weekly", startDate: "2026-09-01", matchPattern: "schoonmaak" },
      { name: "Rent", type: "bill", amount: 900, frequency: "monthly", dueDay: 1, startDate: "2026-01-01", matchPattern: "huur" },
      // Old auto-detected leftover with nothing to place it by: not a bill.
      { name: "Albert Heijn", type: "bill", amount: 30, frequency: "monthly", matchPattern: "albert heijn", source: "auto" },
      // A hand-made monthly bill without a day keeps its row.
      { name: "Gift", type: "bill", amount: 10, frequency: "monthly" },
    ]);
    await db.insert(s.transactions).values([
      { date: "2026-10-06", direction: "expense", type: "variabel", amount: 40, description: "Schoonmaak Ria" },
      { date: "2026-10-13", direction: "expense", type: "variabel", amount: 40, description: "Schoonmaak Ria" },
      { date: "2026-10-01", direction: "expense", type: "rekening", amount: 900, description: "Huur oktober" },
    ]);
  });

  afterAll(() => {
    vi.useRealTimers();
    removeTestDb();
  });

  it("lists each item once per due date in the month", async () => {
    const { getBillStatuses } = await import("@/lib/bill-status");
    const october = await getBillStatuses("2026-10", 1);
    const rows = october.map((s) => [s.item.name, s.dueDate, s.paid]);
    expect(rows).toEqual(expect.arrayContaining([
      ["Cleaner", "2026-10-06", true],
      ["Cleaner", "2026-10-13", true],
      ["Cleaner", "2026-10-20", false],
      ["Cleaner", "2026-10-27", false],
      ["Rent", "2026-10-01", true],
      ["Gift", null, null],
    ]));
    const names = october.map((s) => s.item.name);
    expect(names).not.toContain("Water");
    expect(names).not.toContain("Insurance");
    expect(names).not.toContain("Albert Heijn");
    expect(october.filter((s) => s.dueDate == null).map((s) => s.item.name)).toEqual(["Gift"]);
  });

  it("puts quarterly and yearly bills in their own month", async () => {
    const { getBillStatuses } = await import("@/lib/bill-status");
    // Sunday 8 November 2026 and Saturday 13 March 2027 move to the Monday after.
    expect((await getBillStatuses("2026-11", 1)).find((s) => s.item.name === "Water")?.dueDate).toBe("2026-11-09");
    expect((await getBillStatuses("2027-03", 1)).find((s) => s.item.name === "Insurance")?.dueDate).toBe("2027-03-15");
  });

  it("leaves a skipped month out unless asked for, and only that month", async () => {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { getBillStatuses } = await import("@/lib/bill-status");
    const [saving] = await db
      .insert(s.recurringItems)
      .values({ name: "Holiday fund", type: "savings", amount: 150, frequency: "monthly", dueDay: 25, startDate: "2026-01-25", matchPattern: "vakantie" })
      .returning();
    await db.insert(s.billSkips).values({ recurringItemId: saving.id, month: "2026-10" });
    expect((await getBillStatuses("2026-10", 1)).some((b) => b.item.id === saving.id)).toBe(false);
    const listed = (await getBillStatuses("2026-10", 1, undefined, { includeSkipped: true })).find((b) => b.item.id === saving.id);
    // Due Sunday the 25th, so listed on Monday the 26th.
    expect(listed).toMatchObject({ skipped: true, overdue: false, dueDate: "2026-10-26" });
    expect((await getBillStatuses("2026-11", 1)).find((b) => b.item.id === saving.id)?.skipped).toBe(false);
  });

  it("doesn't call a bill due on the weekend overdue before the Monday", async () => {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { getBillStatuses } = await import("@/lib/bill-status");
    const [phone] = await db
      .insert(s.recurringItems)
      .values({ name: "Phone", type: "bill", amount: 20, frequency: "monthly", dueDay: 24, startDate: "2026-01-24", matchPattern: "telefoon" })
      .returning();
    vi.setSystemTime(new Date(2026, 9, 25, 12)); // Sunday, the day after the 24th
    try {
      const row = (await getBillStatuses("2026-10", 1)).find((b) => b.item.id === phone.id);
      expect(row).toMatchObject({ dueDate: "2026-10-26", paid: false, overdue: false });
    } finally {
      vi.setSystemTime(new Date(2026, 9, 15, 12));
    }
  });

  // The owner's months start on the 23rd, a weekend start rolling back to the Friday.
  const payday23 = { defaultStartDay: 23, weekendRollback: true };
  const status = (rows: { item: { id: number }; dueDate: string | null; paid: boolean | null }[], id: number) =>
    rows.filter((b) => b.item.id === id).map((b) => [b.dueDate, b.paid]);

  it("pays each due date with its nearest payment, across the payday boundary", async () => {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { getBillStatuses } = await import("@/lib/bill-status");
    const [storage, loan] = await db
      .insert(s.recurringItems)
      .values([
        { name: "Self Storage", type: "bill", amount: 103.16, frequency: "monthly", dueDay: 22, startDate: "2026-07-22", matchPattern: "self storage tiel" },
        { name: "Loan 3k", type: "debt", amount: 56.17, frequency: "monthly", dueDay: 22, startDate: "2026-07-22", matchPattern: "ing bank nv", matchAmount: 56.17 },
      ])
      .returning();
    await db.insert(s.transactions).values([
      { date: "2026-08-18", direction: "expense", type: "variabel", amount: 103.16, description: "Self Storage Tiel B.V." },
      { date: "2026-09-23", direction: "expense", type: "variabel", amount: 103.16, description: "Self Storage Tiel B.V." },
      { date: "2026-10-20", direction: "expense", type: "variabel", amount: 103.16, description: "Self Storage Tiel B.V." },
      { date: "2026-08-24", direction: "expense", type: "variabel", amount: 56.17, description: "ING BANK NV" },
      { date: "2026-09-24", direction: "expense", type: "variabel", amount: 56.17, description: "ING BANK NV" },
    ]);

    // 21 August – 22 September holds two due dates of each. Storage was collected on the
    // 18th (before the month) and the 23rd (after it), the loan two days after each date.
    const august = await getBillStatuses("2026-08", payday23);
    expect(status(august, storage.id)).toEqual([["2026-08-24", true], ["2026-09-22", true]]);
    expect(status(august, loan.id)).toEqual([["2026-08-24", true], ["2026-09-22", true]]);
    // The loan's 24 September payment already paid 22 September: it doesn't also pay
    // 22 October just because it falls in that month.
    const september = await getBillStatuses("2026-09", payday23);
    expect(status(september, storage.id)).toEqual([["2026-10-22", true]]);
    expect(status(september, loan.id)).toEqual([["2026-10-22", false]]);
  });

  it("lets one transaction pay one item, preferring the one it is linked to", async () => {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { getBillStatuses } = await import("@/lib/bill-status");
    // A gym paid through the same payee and amount as the tracker subscription.
    const [o2t, gym] = await db
      .insert(s.recurringItems)
      .values([
        { name: "O2T", type: "subscription", amount: 7.95, frequency: "monthly", dueDay: 2, startDate: "2026-08-02", matchPattern: "O2T", matchAmount: 7.95 },
        { name: "Gym Lily", type: "bill", amount: 22.5, frequency: "quarterly", dueDay: 8, startDate: "2026-08-08", matchPattern: "O2T", matchAmount: 7.95 },
      ])
      .returning();
    await db.insert(s.transactions).values([
      { date: "2026-08-04", direction: "expense", type: "variabel", amount: 7.95, description: "O2T Holding B.V. via Mollie", recurringItemId: o2t.id },
      // Not linked: it goes to the nearest due date, O2T's on the 2nd, not the gym's on the 9th.
      { date: "2026-11-03", direction: "expense", type: "variabel", amount: 7.95, description: "O2T Holding B.V. via Mollie" },
    ]);

    const august = await getBillStatuses("2026-08", 1);
    expect(status(august, o2t.id)).toEqual([["2026-08-03", true]]);
    expect(status(august, gym.id)).toEqual([["2026-08-10", false]]);
    const november = await getBillStatuses("2026-11", 1);
    expect(status(november, o2t.id)).toEqual([["2026-11-02", true]]);
    expect(status(november, gym.id)).toEqual([["2026-11-09", false]]);

    // A manual mark still wins.
    await db.insert(s.billPayments).values({ recurringItemId: gym.id, month: "2026-11", amount: 22.5 });
    expect((await getBillStatuses("2026-11", 1)).find((b) => b.item.id === gym.id)).toMatchObject({ paid: true, paidSource: "manual" });
  });

  it("matches the bank's full text and keeps a charge with the item its amount fits", async () => {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { getBillStatuses } = await import("@/lib/bill-status");
    const [icloud, arcade] = await db
      .insert(s.recurringItems)
      .values([
        { name: "iCloud+", type: "subscription", amount: 2.99, frequency: "monthly", dueDay: 30, startDate: "2026-07-30", matchPattern: "APPLE.COM BILL CORK" },
        { name: "Arcade", type: "subscription", amount: 10, frequency: "monthly", dueDay: 25, startDate: "2026-07-25", matchPattern: "APPLE.COM", matchAmount: 10 },
      ])
      .returning();
    await db.insert(s.transactions).values([
      { date: "2026-09-24", direction: "expense", type: "variabel", amount: 10, description: "APPLE.COM BILL CORK IRL" },
      // Bank sync shortens the description; the full text still names Cork.
      { date: "2026-09-29", direction: "expense", type: "variabel", amount: 2.99, description: "APPLE.COM BILL", rawDescription: "APPLE.COM BILL CORK IRL Kaartnr: 5238 53** **** 7037" },
      { date: "2026-10-24", direction: "expense", type: "variabel", amount: 10, description: "APPLE.COM BILL CORK IRL" },
    ]);

    const september = await getBillStatuses("2026-09", 1);
    expect(status(september, arcade.id)).toEqual([["2026-09-25", true]]);
    expect(status(september, icloud.id)).toEqual([["2026-09-30", true]]);
    // October's only charge is Arcade's €10: iCloud+ is still to come.
    const october = await getBillStatuses("2026-10", 1);
    expect(status(october, arcade.id)).toEqual([["2026-10-26", true]]);
    expect(status(october, icloud.id)).toEqual([["2026-10-30", false]]);
  });
});

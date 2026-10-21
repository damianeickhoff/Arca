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
    expect(occurrencesBetween(water, "2026-11-01", "2026-11-30")).toEqual(["2026-11-08"]);
    const insurance = { frequency: "yearly", dueDay: 13, startDate: "2025-03-13" };
    expect(occurrencesBetween(insurance, "2026-01-01", "2026-12-31")).toEqual(["2026-03-13"]);
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
    expect((await getBillStatuses("2026-11", 1)).find((s) => s.item.name === "Water")?.dueDate).toBe("2026-11-08");
    expect((await getBillStatuses("2027-03", 1)).find((s) => s.item.name === "Insurance")?.dueDate).toBe("2027-03-13");
  });
});

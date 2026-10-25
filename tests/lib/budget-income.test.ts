// The income the budget is planned on (src/lib/budget-income.ts): the regular income from
// recurring income items, averaged to a month, else what came in this financial month.
// Runs against a real throwaway SQLite database (see tests/helpers/test-db.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateTestDb, clearFixtures, removeTestDb } from "../helpers/test-db";

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date(2026, 2, 20, 12));

const TODAY = "2026-03-20";
const MARCH = { from: "2026-03-01", to: "2026-03-31" };

type ItemInsert = typeof import("@/db/schema").recurringItems.$inferInsert;
type TxInsert = typeof import("@/db/schema").transactions.$inferInsert;

async function addItems(items: Partial<ItemInsert>[]) {
  const { db } = await import("@/db");
  const { recurringItems } = await import("@/db/schema");
  for (const item of items) {
    await db.insert(recurringItems).values({ name: "Item", type: "income", frequency: "monthly", ...item });
  }
}

async function addIncome(rows: Partial<TxInsert>[]) {
  const { db } = await import("@/db");
  const { transactions } = await import("@/db/schema");
  for (const row of rows) {
    await db.insert(transactions).values({ date: "2026-03-01", amount: 0, description: "In", type: "inkomen", direction: "income", ...row });
  }
}

beforeAll(() => {
  migrateTestDb();
});

beforeEach(async () => {
  await clearFixtures();
});

afterAll(() => {
  vi.useRealTimers();
  removeTestDb();
});

describe("budget-income: regularMonthlyIncome", () => {
  it("averages each frequency to a month", async () => {
    const { regularMonthlyIncome } = await import("@/lib/budget-income");
    const base = { type: "income", active: true, paused: false, dismissed: false, isReimbursement: false, startDate: null, endDate: null };
    const total = regularMonthlyIncome(
      [
        { ...base, amount: 2500, frequency: "monthly" },
        { ...base, amount: 100, frequency: "weekly" }, // 100 × 52 / 12
        { ...base, amount: 600, frequency: "quarterly" }, // 200
        { ...base, amount: 1200, frequency: "yearly" }, // 100
        { ...base, amount: 300, frequency: "four_weekly" }, // 300 × 13 / 12 = 325
        { ...base, amount: 999, frequency: "once" }, // not regular
      ],
      TODAY,
    );
    expect(total).toBeCloseTo(2500 + (100 * 52) / 12 + 200 + 100 + 325, 6);
  });

  it("only counts income items that are on and inside their period", async () => {
    const { regularMonthlyIncome } = await import("@/lib/budget-income");
    const base = { type: "income", amount: 100, frequency: "monthly", active: true, paused: false, dismissed: false, isReimbursement: false, startDate: null, endDate: null };
    const total = regularMonthlyIncome(
      [
        { ...base, amount: 2000 },
        { ...base, type: "bill" },
        { ...base, active: false },
        { ...base, paused: true },
        { ...base, dismissed: true },
        { ...base, isReimbursement: true },
        { ...base, endDate: "2026-03-19" }, // ended yesterday
        { ...base, startDate: "2026-03-21" }, // starts tomorrow
        { ...base, amount: 10, startDate: "2026-01-01", endDate: "2026-03-20" }, // ends today: still in
      ],
      TODAY,
    );
    expect(total).toBe(2010);
  });
});

describe("budget-income: getBudgetIncome", () => {
  it("uses the regular income from recurring items, not what came in", async () => {
    const { getBudgetIncome } = await import("@/lib/budget-income");
    await addItems([
      { name: "Salary", amount: 2400 },
      { name: "Child benefit", amount: 300, frequency: "quarterly" },
      { name: "Old job", amount: 1800, endDate: "2026-01-31" },
      { name: "New job", amount: 2600, startDate: "2026-04-01" },
      { name: "Paused side job", amount: 400, paused: true, active: false },
      { name: "Housemates pay back", amount: 150, isReimbursement: true },
    ]);
    // A one-off refund this month doesn't inflate the regular income.
    await addIncome([{ amount: 2400, description: "Salary" }, { amount: 500, description: "Marketplace sale" }]);
    expect(await getBudgetIncome(MARCH, TODAY)).toEqual({ income: 2500, source: "recurring" });
  });

  it("falls back to what came in this month without recurring income", async () => {
    const { getBudgetIncome } = await import("@/lib/budget-income");
    await addItems([{ name: "Ended", amount: 1800, endDate: "2026-01-31" }, { name: "Nothing", amount: 0 }]);
    await addIncome([
      { amount: 1900, description: "Salary" },
      { amount: 40, description: "Tikkie", isReimbursement: true },
      { amount: 300, description: "Own savings", isManualTransfer: true },
      { amount: 999, date: "2026-02-28", description: "Last month" },
    ]);
    expect(await getBudgetIncome(MARCH, TODAY)).toEqual({ income: 1900, source: "received" });
  });

  it("is 0 from received income before anything came in", async () => {
    const { getBudgetIncome } = await import("@/lib/budget-income");
    expect(await getBudgetIncome(MARCH, TODAY)).toEqual({ income: 0, source: "received" });
  });
});

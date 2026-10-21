// Insights › Trends and Net worth, end to end against a throwaway database: the
// loaders read real rows through Drizzle and hand them to the pure helpers.
//
// The clock is pinned to Wednesday 21 October 2026 with budget months from the 1st, so
// October is running and May … September are finished.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { clearFixtures, migrateTestDb, removeTestDb } from "../helpers/test-db";

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date(2026, 9, 21, 12));

const FM = { defaultStartDay: 1, overrides: {}, weekendRollback: false };
const ACCOUNT = "NL11INGB0001234567";

beforeAll(async () => {
  migrateTestDb();
  await clearFixtures();
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const { sql } = await import("drizzle-orm");
  await db.run(sql`DELETE FROM vermogen_accounts`);
  await db.run(sql`DELETE FROM goals`);
  await db.run(sql`DELETE FROM savings_goals`);
  await db.run(sql`DELETE FROM banks`);

  const [groceries] = await db.insert(s.categories).values({ name: "T Groceries", group: "", budgetType: "nodig" }).returning();
  const [fun] = await db.insert(s.categories).values({ name: "T Fun", group: "", budgetType: "willen" }).returning();
  const [salary] = await db.insert(s.categories).values({ name: "T Salary", group: "income" }).returning();
  await db.insert(s.banks).values({ accountNumber: ACCOUNT, displayName: "Betaalrekening", startingBalance: 1000, startingDate: "2025-12-31", cardType: "debitcard", includeInNetWorth: true });

  const rows: (typeof s.transactions.$inferInsert)[] = [];
  let n = 0;
  const add = (date: string, direction: "income" | "expense", amount: number, categoryId: number) =>
    rows.push({ date, direction, type: direction === "income" ? "inkomen" : "variabel", amount, description: `row ${++n}`, categoryId, account: ACCOUNT, source: "csv_import", importHash: `h${n}` });
  for (let m = 1; m <= 10; m++) {
    const mm = String(m).padStart(2, "0");
    add(`2026-${mm}-01`, "income", 3000, salary.id);
    add(`2026-${mm}-05`, "expense", 1200, groceries.id);
    // Fun goes up from May on: the biggest mover.
    add(`2026-${mm}-10`, "expense", m >= 5 ? 400 : 100, fun.id);
  }
  await db.insert(s.transactions).values(rows);

  const [fund] = await db.insert(s.vermogenAccounts).values({ name: "T Fund", type: "beleggingen", value: 5000, lastUpdated: "2026-10-02", includeInNetWorth: true }).returning();
  await db.insert(s.vermogenAccountValues).values({ accountId: fund.id, date: "2026-06-01", value: 4000 });
  await db.insert(s.debts).values({ name: "T Loan", direction: "owe", startingBalance: 2000, minimumPayment: 100, startMonth: "2026-01", startDate: "2026-01-01", balanceDate: "2026-01-01" });
});

afterAll(() => removeTestDb());

describe("loadTrends", () => {
  it("averages the finished months and finds the mover", async () => {
    const { loadTrends } = await import("@/app/trends/load-trends");
    const data = await loadTrends({ range: { kind: "months", count: 6 }, financialMonth: FM });
    expect(data.months).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(data.running).toBe("2026-10");
    expect(data.summary.finished).toBe(5);
    expect(data.summary.avgIncome).toBe(3000);
    expect(data.summary.avgExpense).toBe(1600);
    expect(data.summary.kept).toBe(1400);
    expect(data.movers?.up[0]).toMatchObject({ name: "T Fun", before: 100, after: 400, delta: 300 });
    expect(data.categories.map((c) => c.name)).toEqual(["T Groceries", "T Fun"]);
    expect(data.comparison.cmpA).toBe("2026-10");
    expect(data.comparison.cmpB).toBe("2026-09");
  });
});

describe("loadNetWorth", () => {
  it("rebuilds the accounts' history and ends on today's values", async () => {
    const { loadNetWorth } = await import("@/app/net-worth/load-net-worth");
    const data = await loadNetWorth("6m", FM);
    const bank = data.accounts.find((a) => a.type === "bank")!;
    // 1000 + 10 × (3000 − 1200) − 4 × 100 − 6 × 400
    expect(bank.end).toBe(16200);
    expect(bank.values.at(-1)).toBe(16200);
    expect(bank.start).toBeLessThan(bank.end);
    const fund = data.accounts.find((a) => a.type === "manual")!;
    expect(fund.values[0]).toBe(4000);
    expect(fund.end).toBe(5000);
    const loan = data.accounts.find((a) => a.type === "debt")!;
    expect(loan.side).toBe("debt");
    expect(loan.end).toBeLessThan(loan.start);
    expect(data.netWorth).toBeCloseTo(data.assets - data.debts, 2);
    expect(data.stacked.net.at(-1)).toBe(data.netWorth);
    expect(data.step?.name).toBe("T Fund");
    expect(data.manual).toHaveLength(1);
    const cash = data.changes.groups.find((g) => g.group === "cash");
    // October so far: salary in, groceries and fun out.
    expect(cash?.total).toBe(3000 - 1200 - 400);
  });
});

// Characterisation tests for the DB-backed money modules, run against a real,
// throwaway SQLite database built by the app's own migration (see tests/setup.ts and
// tests/helpers/test-db.ts). Nothing is mocked: fixtures go in through Drizzle and the
// production functions read them back.
//
// The clock is pinned to Friday 20 March 2026 with a financial month starting on the
// 1st, so "this month" is 2026-03-01 … 2026-03-31 and the six completed months the
// health score looks at are 2025-09 … 2026-02.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateTestDb, clearFixtures, removeTestDb } from "../helpers/test-db";

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date(2026, 2, 20, 12));

const config = { defaultStartDay: 1, overrides: {}, weekendRollback: false };

type Ids = Record<string, number>;
const cat: Ids = {};
const rec: Ids = {};
const tx: Ids = {};
const debt: Ids = {};

async function seed() {
  const { db } = await import("@/db");
  const s = await import("@/db/schema");

  const insertCategory = async (key: string, values: typeof s.categories.$inferInsert) => {
    const [row] = await db.insert(s.categories).values(values).returning();
    cat[key] = row.id;
  };
  await insertCategory("groceries", { name: "T Groceries", group: "variable", budgetType: "nodig" });
  await insertCategory("fun", { name: "T Fun", group: "variable", budgetType: "willen" });
  await insertCategory("snacks", { name: "T Snacks", group: "variable", budgetType: "nodig", parentCategoryId: cat.groceries });
  await insertCategory("storage", { name: "T Storage", group: "bill", budgetType: "nodig" });
  await insertCategory("salary", { name: "T Salary", group: "income" });
  await insertCategory("savings", { name: "T Savings", group: "savings", budgetType: "sparen" });

  await db.insert(s.budgetTargets).values([
    { year: 0, month: 0, categoryId: cat.groceries, targetAmount: 400 },
    { year: 0, month: 0, categoryId: cat.fun, targetAmount: 100 },
    // March override for Fun.
    { year: 2026, month: 3, categoryId: cat.fun, targetAmount: 150 },
  ]);
  await db.insert(s.budgets).values({ amount: 800, period: "monthly" });

  const insertRecurring = async (key: string, values: typeof s.recurringItems.$inferInsert) => {
    const [row] = await db.insert(s.recurringItems).values(values).returning();
    rec[key] = row.id;
  };
  await insertRecurring("storage", {
    name: "Storage box", type: "bill", amount: 103, frequency: "monthly", categoryId: cat.storage,
    matchPattern: "storage box", sharedReimbursedAmount: 77.25, sharedWithCount: 4,
  });
  await insertRecurring("stream", { name: "Streamflix", type: "subscription", amount: 50, frequency: "monthly", categoryId: cat.fun, matchPattern: "streamflix" });
  await insertRecurring("salary", { name: "Salary", type: "income", amount: 2500, frequency: "monthly", matchPattern: "werkgever" });
  await insertRecurring("carloan", { name: "Car loan", type: "debt", amount: 150, frequency: "monthly", matchPattern: "autolening" });
  await insertRecurring("piet", { name: "Piet pays back", type: "income", amount: 50, frequency: "monthly", matchPattern: "piet" });
  await insertRecurring("yearly", { name: "Insurance", type: "bill", amount: 240, frequency: "yearly" });

  const insertTx = async (key: string, values: Omit<typeof s.transactions.$inferInsert, "type">) => {
    const [row] = await db
      .insert(s.transactions)
      .values({ type: values.direction === "income" ? "inkomen" : "variabel", ...values })
      .returning();
    tx[key] = row.id;
  };

  // Six completed months of history for the health window (2025-09 … 2026-02).
  const history: [string, number, number][] = [
    ["2025-09", 2500, 1900],
    ["2025-10", 2500, 2100],
    ["2025-11", 2600, 1800],
    ["2025-12", 2400, 2600],
    ["2026-01", 2500, 2000],
    ["2026-02", 2500, 300],
  ];
  for (const [month, income, spend] of history) {
    await insertTx(`inc-${month}`, { date: `${month}-01`, direction: "income", amount: income, description: "Werkgever BV", categoryId: cat.salary, recurringItemId: rec.salary });
    await insertTx(`gro-${month}`, { date: `${month}-10`, direction: "expense", amount: spend, description: "Albert Heijn", categoryId: cat.groceries });
  }

  // This financial month (March 2026).
  await insertTx("salary", { date: "2026-03-01", direction: "income", amount: 2500, description: "Werkgever BV", categoryId: cat.salary, recurringItemId: rec.salary });
  await insertTx("ah", { date: "2026-03-02", direction: "expense", amount: 120, description: "Albert Heijn", categoryId: cat.groceries });
  await insertTx("piet", { date: "2026-03-03", direction: "income", amount: 50, description: "Piet terugbetaling" });
  await insertTx("kiosk", { date: "2026-03-05", direction: "expense", amount: 30, description: "Kiosk", categoryId: cat.snacks });
  await insertTx("storage", { date: "2026-03-06", direction: "expense", amount: 103, description: "Storage box", categoryId: cat.storage, recurringItemId: rec.storage });
  await insertTx("bol", { date: "2026-03-10", direction: "expense", amount: 60, description: "Bol.com" });
  await insertTx("carloan", { date: "2026-03-11", direction: "expense", amount: 150, description: "Autolening maart" });
  await insertTx("tosavings", { date: "2026-03-12", direction: "expense", amount: 200, description: "Naar spaar", categoryId: cat.savings });
  await insertTx("tikkie", { date: "2026-03-15", direction: "income", amount: 25, description: "Tikkie Jan", isReimbursement: true });
  await insertTx("transfer", { date: "2026-03-18", direction: "expense", amount: 500, description: "Eigen rekening", categoryId: cat.fun, isManualTransfer: true });
  await insertTx("stream", { date: "2026-03-19", direction: "expense", amount: 50, description: "Streamflix", categoryId: cat.fun, recurringItemId: rec.stream });
  await insertTx("corrected", { date: "2026-03-19", direction: "expense", amount: 80, correctedAmount: 45, description: "Restaurant", categoryId: cat.fun });

  await db.insert(s.transactionSplits).values([
    { transactionId: tx.bol, amount: 40, categoryId: cat.fun, position: 0 },
    { transactionId: tx.bol, amount: 20, categoryId: cat.groceries, position: 1 },
  ]);
  // The Tikkie pays back €25 of the Bol.com order.
  await db.insert(s.reimbursements).values({ reimbursementTransactionId: tx.tikkie, originalTransactionId: tx.bol, amount: 25 });

  await db.insert(s.vermogenAccounts).values([
    { name: "Spaarrekening", type: "spaarrekening", value: 5000 },
    { name: "Aandelen", type: "beleggingen", value: 9000 },
  ]);
  await db.insert(s.banks).values({ accountNumber: "NL11INGB0001234567", displayName: "Betaalrekening", startingBalance: 100, cardType: "debitcard" });

  const insertDebt = async (key: string, values: typeof s.debts.$inferInsert) => {
    const [row] = await db.insert(s.debts).values(values).returning();
    debt[key] = row.id;
  };
  await insertDebt("loan", { name: "Study loan", direction: "owe", startingBalance: 1200, minimumPayment: 100, startMonth: "2026-01", startDate: "2026-01-15" });
  await insertDebt("car", { name: "Car", direction: "owe", startingBalance: 3000, minimumPayment: 150, interestRate: 6, startMonth: "2026-01", startDate: "2026-01-10" });
  await insertDebt("piet", { name: "Piet", direction: "owed", startingBalance: 300, minimumPayment: 50, startMonth: "2026-02", startDate: "2026-02-01" });
  await db.insert(s.debtRecurring).values([
    { debtId: debt.car, recurringItemId: rec.carloan },
    { debtId: debt.piet, recurringItemId: rec.piet },
  ]);
  // February's car payment was marked paid by hand; March's auto-matches "Autolening".
  await db.insert(s.billPayments).values({ recurringItemId: rec.carloan, month: "2026-02", amount: 150 });

  await db.insert(s.savingsGoals).values({ name: "Holiday", targetAmount: 2000, monthlyContribution: 100 });
}

async function setSetting(key: string, value: string | null) {
  const { db } = await import("@/db");
  const { appSettings } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await db.delete(appSettings).where(eq(appSettings.key, key));
  if (value !== null) await db.insert(appSettings).values({ key, value });
}

beforeAll(async () => {
  migrateTestDb();
  await clearFixtures();
  await seed();
});

afterAll(() => {
  vi.useRealTimers();
  removeTestDb();
});

describe("budget-overview: getBudgetOverview", () => {
  it("measures the current financial month against the overall budget", async () => {
    const { getBudgetOverview } = await import("@/lib/budget-overview");
    const o = await getBudgetOverview(config);
    expect(o.budget).toMatchObject({ amount: 800, period: "monthly" });
    expect([o.from, o.to, o.daysLeft]).toEqual(["2026-03-01", "2026-03-31", 12]);
    // Allocated = sum of default category targets (the March override is not used here).
    expect(o.allocated).toBe(500);
    // Income excludes the Tikkie but includes Piet's repayment: 2500 + 50.
    expect(o.income).toBe(2550);
    expect(o.strategy).toEqual({ nodig: 60, willen: 25, sparen: 15 });

    const byId = new Map(o.categories.map((c) => [c.categoryId, c]));
    // Groceries rolls up Snacks (which has no budget of its own) and its 20 split share.
    expect(byId.get(cat.groceries)).toMatchObject({ budget: 400, spent: 170, parentCategoryId: null });
    expect(byId.get(cat.snacks)).toMatchObject({ budget: null, spent: 30, parentCategoryId: cat.groceries });
    // Fun: 40 split + 45 corrected + 50 recurring (counted: "budgeted" mode, Fun has a budget).
    // The 500 manual transfer is excluded.
    expect(byId.get(cat.fun)).toMatchObject({ budget: 100, spent: 135 });
    // Storage is a bill category but has budgetType "nodig", so it is variable spend too.
    // It has no budget, so its recurring-matched charge is NOT counted in "budgeted" mode.
    expect(byId.get(cat.storage)).toMatchObject({ budget: null, spent: 0 });
    expect(byId.get(cat.savings)).toMatchObject({ budget: null, spent: 200 });
    expect(o.totalSpent).toBe(120 + 30 + 20 + 40 + 45 + 50 + 200);
    expect(o.budgetedSpent).toBe(170 + 135);
    expect(o.categories.find((c) => c.categoryId === cat.groceries)!.last30).toBe(170);
    expect(o.last7Total).toMatchInlineSnapshot(`95`);
    expect(o.last30Total).toMatchInlineSnapshot(`505`);
  });

  it("recurring mode 'always' counts recurring charges everywhere; 'exclude' nowhere", async () => {
    const { getBudgetOverview } = await import("@/lib/budget-overview");
    await setSetting("budget_recurring_mode", "always");
    const always = await getBudgetOverview(config);
    expect(always.categories.find((c) => c.categoryId === cat.storage)!.spent).toBe(103);
    await setSetting("budget_recurring_mode", "exclude");
    const exclude = await getBudgetOverview(config);
    expect(exclude.categories.find((c) => c.categoryId === cat.fun)!.spent).toBe(85);
    await setSetting("budget_recurring_mode", null);
  });

  it("net shared-cost mode subtracts linked reimbursements first, then the shared estimate", async () => {
    const { getBudgetOverview } = await import("@/lib/budget-overview");
    await setSetting("shared_cost_mode", "net");
    await setSetting("budget_recurring_mode", "always");
    try {
      const o = await getBudgetOverview(config);
      // Storage box: 103 − 77.25 shared estimate = 25.75.
      expect(o.categories.find((c) => c.categoryId === cat.storage)!.spent).toBe(25.75);
      // Bol.com 60 split 40/20 with the €25 Tikkie linked → 16.67 / 8.33 netted off the
      // splits — the same figures getBudgetData produces below.
      expect(o.categories.find((c) => c.categoryId === cat.fun)!.spent).toBeCloseTo(23.33 + 45 + 50, 2);
      expect(o.categories.find((c) => c.categoryId === cat.groceries)!.spent).toBeCloseTo(120 + 30 + 11.67, 2);
    } finally {
      await setSetting("shared_cost_mode", null);
      await setSetting("budget_recurring_mode", null);
    }
  });

  it("reimbursedAmountExpr gives the same answer with or without a join", async () => {
    const { db } = await import("@/db");
    const { transactions, categories } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { reimbursedAmountExpr } = await import("@/lib/reimbursed-amount");
    const unjoined = await db.select({ id: transactions.id, r: reimbursedAmountExpr }).from(transactions);
    const joined = await db
      .select({ id: transactions.id, r: reimbursedAmountExpr })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id));
    const pick = (rows: { id: number; r: number }[], id: number) => rows.find((row) => row.id === id)!.r;
    expect(pick(joined, tx.bol)).toBe(25);
    expect(pick(unjoined, tx.bol)).toBe(25);
    // Nothing linked and no shared bill → 0 either way.
    expect(pick(joined, tx.ah)).toBe(0);
    expect(pick(unjoined, tx.ah)).toBe(0);
    // The shared-bill fallback works either way.
    expect(pick(joined, tx.storage)).toBe(77.25);
    expect(pick(unjoined, tx.storage)).toBe(77.25);
  });
});

describe("budget-data: getBudgetData / getLeftThisMonth", () => {
  it("per-category actuals with month overrides and rollover", async () => {
    const { getBudgetData } = await import("@/lib/budget-data");
    const data = await getBudgetData("2026-03", config, true);
    expect(data.month).toBe("2026-03");
    expect(data.income).toBe(2550);
    const rows = new Map(data.targetRows.map((r) => [r.categoryId, r]));
    // Only top-level categories get a row; Snacks is rolled into Groceries.
    expect(rows.has(cat.snacks)).toBe(false);
    // February: 300 spent of a 400 default → 100 rolls over.
    expect(rows.get(cat.groceries)).toMatchObject({ actual: 170, target: 400, rollover: 100, effectiveTarget: 500, isOverridden: false, hasDefault: true });
    // Fun: March override 150; February had no Fun spend → full 100 default rolls over.
    // CURRENT BEHAVIOUR: unlike getBudgetOverview, recurring-matched spend always counts here.
    expect(rows.get(cat.fun)).toMatchObject({ actual: 135, target: 150, rollover: 100, effectiveTarget: 250, isOverridden: true });
    expect(rows.get(cat.storage)).toMatchObject({ actual: 103, target: null, effectiveTarget: null });
    expect(data.byBudgetType).toEqual({ nodig: 120 + 30 + 20 + 103, willen: 135, sparen: 200 });
    expect(data.dailySplit.map((d) => d.date)).toEqual([
      "2026-03-14", "2026-03-15", "2026-03-16", "2026-03-17", "2026-03-18", "2026-03-19", "2026-03-20",
    ]);
    expect(data.dailySplit.find((d) => d.date === "2026-03-19")!.byBucket).toEqual({ willen: 95 });
  });

  it("net shared-cost mode nets linked reimbursements and shared estimates", async () => {
    const { getBudgetData } = await import("@/lib/budget-data");
    await setSetting("shared_cost_mode", "net");
    try {
      const data = await getBudgetData("2026-03", config, false);
      const rows = new Map(data.targetRows.map((r) => [r.categoryId, r]));
      // Bol.com 60 split 40/20 with the €25 Tikkie → 16.67 / 8.33 netted off the splits.
      expect(rows.get(cat.groceries)!.actual).toBeCloseTo(120 + 30 + 11.67, 2);
      expect(rows.get(cat.fun)!.actual).toBeCloseTo(23.33 + 45 + 50, 2);
      expect(rows.get(cat.storage)!.actual).toBe(25.75);
      // Income stays gross.
      expect(data.income).toBe(2550);
    } finally {
      await setSetting("shared_cost_mode", null);
    }
  });

  it("getLeftThisMonth totals only the categories with a target", async () => {
    const { getLeftThisMonth } = await import("@/lib/budget-data");
    expect(await getLeftThisMonth(config, false)).toEqual({
      totalTarget: 550,
      totalSpentOnTargets: 305,
      totalLeft: 245,
      rawTotalPct: (305 / 550) * 100,
      totalPct: (305 / 550) * 100,
      totalOver: false,
    });
  });
});

describe("debts: getDebtRecurringLinks / getDebtSummary", () => {
  it("paidFor reads manual marks and auto-matches per month, in the debt's direction", async () => {
    const { getDebtRecurringLinks } = await import("@/lib/debt-recurring-paid");
    const links = await getDebtRecurringLinks(config);
    expect(links.linkMap.get(debt.car)).toEqual([rec.carloan]);
    expect(links.paidFor({ id: debt.loan, startMonth: "2026-01", startDate: "2026-01-15" })).toBeNull();
    expect(links.paidFor({ id: debt.car, startMonth: "2026-01", startDate: "2026-01-10" })).toEqual({
      total: 300,
      byMonth: [
        { month: "2026-02", amount: 150 },
        { month: "2026-03", amount: 150 },
      ],
    });
    // "owed" debts settle on income: Piet's €50 landed in March.
    expect(links.paidFor({ id: debt.piet, startMonth: "2026-02", startDate: "2026-02-01", direction: "owed" })).toEqual({
      total: 50,
      byMonth: [{ month: "2026-03", amount: 50 }],
    });
    // Reconstructing an earlier month only replays history up to it.
    expect(links.paidFor({ id: debt.car, startMonth: "2026-01", startDate: "2026-01-10" }, "2026-02")!.total).toBe(150);
  });

  it("getDebtSummary splits liabilities from receivables", async () => {
    const { getDebtSummary } = await import("@/lib/debt-calculations");
    const summary = (await getDebtSummary())!;
    const byId = new Map(summary.debts.map((d) => [d.debt.id, d]));
    // Unlinked, interest-free: Feb + Mar assumed paid at 100.
    expect(byId.get(debt.loan)).toMatchObject({ amountPaid: 200, currentBalance: 1000 });
    // Linked with 6% interest: two payments of 150 replayed against accruing interest.
    expect(byId.get(debt.car)!.currentBalance).toMatchInlineSnapshot(`2729.33`);
    expect(byId.get(debt.piet)).toMatchObject({ amountPaid: 50, currentBalance: 250 });
    expect(summary.totalOwed).toBe(250);
    expect(summary.totalStarting).toBe(4200);
    expect(summary.totalBalance).toBeCloseTo(1000 + byId.get(debt.car)!.currentBalance, 2);
    expect(summary.paidPct).toMatchInlineSnapshot(`11`);
  });
});

describe("net-worth-forecast: getNetWorthForecast", () => {
  it("adds recurring income, savings contributions and owed repayments each month", async () => {
    const { getNetWorthForecast } = await import("@/lib/net-worth-forecast");
    const points = await getNetWorthForecast(10_000, "2026-03-20", 6);
    // Monthly: salary 2500 + savings goal 100 + Piet's repayment 50 until the 250 he still
    // owes is collected (five months), then nothing from Piet. His recurring income item
    // is linked to the owed debt, so it is that same repayment and isn't added again.
    expect(points).toEqual([
      { date: "2026-04-20", netWorth: 12_650 },
      { date: "2026-05-20", netWorth: 15_300 },
      { date: "2026-06-20", netWorth: 17_950 },
      { date: "2026-07-20", netWorth: 20_600 },
      { date: "2026-08-20", netWorth: 23_250 },
      { date: "2026-09-20", netWorth: 25_850 },
    ]);
  });
});

describe("financial-health-data: getHealthMetrics", () => {
  it("measures the six completed months before the current one", async () => {
    const { getHealthMetrics } = await import("@/lib/financial-health-data");
    const { metrics, monthTotals } = await getHealthMetrics(config);
    expect(monthTotals.map((m) => m.month)).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthTotals.map((m) => [m.income, m.expenses, m.variableSpend])).toEqual([
      [2500, 1900, 1900],
      [2500, 2100, 2100],
      [2600, 1800, 1800],
      [2400, 2600, 2600],
      [2500, 2000, 2000],
      [2500, 300, 300],
    ]);
    expect(metrics.monthsCovered).toBe(6);
    expect(metrics.savingsRate).toBeCloseTo((15000 - 10700) / 15000, 10);
    // Only the Spaarrekening asset counts as liquid (investments don't; the bank isn't savings).
    expect(metrics.emergencyFundMonths).toBeCloseTo(5000 / (10700 / 6), 10);
    // Budget 800: months over it score 1 − overspend/limit, floored at 0.
    expect(metrics.budgetAdherence).toMatchInlineSnapshot(`0.16666666666666666`);
    // Recurring bill + subscription + debt items (103 + 50 + 150 + 240/12) vs average income.
    expect(metrics.recurringRatio).toBeCloseTo((103 + 50 + 150 + 20) / 2500, 10);
    expect(metrics.debtRatio).toBeCloseTo((100 + 150) / 2500, 10);
    expect(metrics.incomeVariation).toMatchInlineSnapshot(`0.02309401076758503`);
  });

  it("getFinancialHealthScore wraps the scorer", async () => {
    const { getFinancialHealthScore } = await import("@/lib/financial-health-data");
    expect(await getFinancialHealthScore(config)).toMatchInlineSnapshot(`
      {
        "color": "var(--color-warning)",
        "score": 68,
        "stateKey": "fair",
        "topOpportunity": "budgetAdherence",
      }
    `);
  });
});

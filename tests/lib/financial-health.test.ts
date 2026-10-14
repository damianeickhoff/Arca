// Characterisation tests for the pure health scorer that financial-health-data.ts
// feeds, plus the pure daily-bucket helper exported by budget-data.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HEALTH_MAX_POINTS, healthState, scoreFinancialHealth, type HealthMetrics } from "@/lib/financial-health";
import { getDailyBucketSplit } from "@/lib/budget-data";

const empty: HealthMetrics = {
  savingsRate: null,
  emergencyFundMonths: null,
  budgetAdherence: null,
  recurringRatio: null,
  debtRatio: null,
  incomeVariation: null,
  monthsCovered: 0,
};

describe("scoreFinancialHealth", () => {
  it("max points add up to 100", () => {
    expect(HEALTH_MAX_POINTS).toBe(100);
  });

  it("returns a null score when nothing is measurable", () => {
    const result = scoreFinancialHealth(empty);
    expect(result.score).toBeNull();
    expect(result.state).toBeNull();
    expect(result.categories.every((c) => !c.available)).toBe(true);
  });

  it("normalises over the measurable categories only", () => {
    // Savings rate 10% → half of 20 points = 10. Debt ratio 0 → 15 of 15. 25/35 → 71.
    const result = scoreFinancialHealth({ ...empty, savingsRate: 0.1, debtRatio: 0, monthsCovered: 3 });
    expect(result.earned).toBe(25);
    expect(result.available).toBe(35);
    expect(result.score).toBe(71);
    expect(result.state?.key).toBe("fair");
    expect(result.opportunities.map((o) => o.key)).toEqual(["savingsRate"]);
  });

  it("scores a full realistic profile", () => {
    const result = scoreFinancialHealth({
      savingsRate: 0.15,
      emergencyFundMonths: 3,
      budgetAdherence: 0.9,
      recurringRatio: 0.45,
      debtRatio: 0.1,
      incomeVariation: 0.1,
      monthsCovered: 6,
    });
    expect(result.categories.map((c) => [c.key, c.points])).toEqual([
      ["savingsRate", 15],
      ["emergencyFund", 10],
      ["budgetAdherence", 18],
      ["recurringExpenses", 11],
      ["debtRatio", 11],
      ["incomeStability", 9],
    ]);
    expect(result.score).toBe(74);
    expect(result.state?.key).toBe("fair");
    expect(result.opportunities[0].key).toBe("emergencyFund");
    expect(result.summary).toMatchInlineSnapshot(`"Your finances are on reasonably steady ground. Budget Adherence is your strongest area at 18/20. Emergency Fund has the most room to grow — your savings currently cover approximately 3 months of expenses. Building towards 6 months of expenses in easy-to-reach savings would have the biggest impact on your resilience."`);
  });

  it("healthState bands", () => {
    expect([95, 90, 89, 75, 74, 50, 49, 0].map((s) => healthState(s).key)).toEqual([
      "excellent", "excellent", "good", "good", "fair", "fair", "attention", "attention",
    ]);
  });
});

describe("getDailyBucketSplit", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 2, 10, 12)); // 10 March 2026
  });
  afterEach(() => vi.useRealTimers());

  it("buckets the last N days of expense by budget type, inside the range only", () => {
    const types = new Map<number, string | null>([[1, "nodig"], [2, "willen"], [3, null]]);
    const allocations = [
      { date: "2026-03-10", direction: "expense", amount: 10, isInternalTransfer: false, categoryId: 1 },
      { date: "2026-03-10", direction: "expense", amount: 5, isInternalTransfer: false, categoryId: 1 },
      { date: "2026-03-09", direction: "expense", amount: 7, isInternalTransfer: false, categoryId: 2 },
      { date: "2026-03-09", direction: "income", amount: 100, isInternalTransfer: false, categoryId: 1 },
      { date: "2026-03-08", direction: "expense", amount: 50, isInternalTransfer: true, categoryId: 1 },
      { date: "2026-03-08", direction: "expense", amount: 3, isInternalTransfer: false, categoryId: 3 },
      { date: "2026-03-08", direction: "expense", amount: 4, isInternalTransfer: false, categoryId: null },
    ];
    const split = getDailyBucketSplit(allocations, types, "2026-03-07", "2026-04-06", 7);
    expect(split).toEqual([
      { date: "2026-03-07", byBucket: {} },
      { date: "2026-03-08", byBucket: {} },
      { date: "2026-03-09", byBucket: { willen: 7 } },
      { date: "2026-03-10", byBucket: { nodig: 15 } },
    ]);
  });

  it("ends on the range end when the range is already over", () => {
    const split = getDailyBucketSplit([], new Map(), "2026-02-01", "2026-02-28", 3);
    expect(split.map((d) => d.date)).toEqual(["2026-02-26", "2026-02-27", "2026-02-28"]);
  });
});

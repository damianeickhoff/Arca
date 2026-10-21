// Insights › Overview's summary: the figures it shows without AI and hands to Gemini.
import { describe, expect, it } from "vitest";
import {
  averagePerDay,
  balanceOf,
  blockMapLayout,
  buildSummaryFacts,
  monthOfPeriod,
  runningTotals,
  toPeriodSummary,
  withOther,
  type SummaryInput,
} from "@/lib/period-facts";

describe("averagePerDay", () => {
  it("divides by the days and rounds to cents", () => {
    expect(averagePerDay(100, 3)).toBe(33.33);
  });

  it("never divides by less than one day", () => {
    expect(averagePerDay(42.5, 0)).toBe(42.5);
  });
});

describe("withOther", () => {
  const rows = [
    { name: "Health", spent: 144.2 },
    { name: "Travel", spent: 1590.85 },
    { name: "Empty", spent: 0 },
  ];

  it("sorts the rows, drops empty ones and keeps the rest of the total as Other", () => {
    const r = withOther(rows, 6707.75);
    expect(r.rows.map((x) => x.name)).toEqual(["Travel", "Health"]);
    expect(r.other).toBe(4972.7);
    expect(r.otherShare).toBeCloseTo(4972.7 / 6707.75, 6);
  });

  it("has no Other when the rows add up to the total, and none below zero", () => {
    expect(withOther(rows, 1735.05).other).toBe(0);
    expect(withOther(rows, 1000).other).toBe(0);
  });

  it("has no share without a total", () => {
    expect(withOther([], 0)).toEqual({ rows: [], other: 0, otherShare: 0 });
  });
});

describe("runningTotals", () => {
  // October (31 days) on the 20th; the previous period is 31 days before it, 31 Aug – 30 Sep.
  const daily = new Map([
    ["2026-10-01", 100],
    ["2026-10-05", 50.5],
    ["2026-10-20", 49.5],
    ["2026-10-25", 999], // after today: never part of "so far"
  ]);
  const previousDaily = new Map([
    ["2026-08-31", 80], // day 1 of the previous period
    ["2026-09-10", 170], // day 11
    ["2026-09-25", 300], // day 26
  ]);
  const base = { from: "2026-10-01", to: "2026-10-31", today: "2026-10-20", daily, previousDaily };

  it("adds up this period day by day up to today", () => {
    const r = runningTotals(base);
    expect(r.days).toBe(31);
    expect(r.elapsed).toBe(20);
    expect(r.current).toHaveLength(20);
    expect(r.current[0]).toBe(100);
    expect(r.current[4]).toBe(150.5);
    expect(r.current[19]).toBe(200);
  });

  it("aligns the previous period by day index", () => {
    const r = runningTotals(base);
    expect(r.previous).toHaveLength(31);
    expect(r.previous[0]).toBe(80);
    expect(r.previous[10]).toBe(250);
    expect(r.previous[30]).toBe(550);
  });

  it("compares with the previous period by the same day", () => {
    const r = runningTotals(base);
    expect(r.previousAtSameDay).toBe(250);
    expect(r.difference).toBe(-50);
  });

  it("projects the daily average so far to the last day", () => {
    expect(runningTotals(base).projected).toBe(310);
  });

  it("has no projection once the period is over, and compares whole periods", () => {
    const r = runningTotals({ ...base, today: "2026-11-03" });
    expect(r.elapsed).toBe(31);
    expect(r.projected).toBeNull();
    expect(r.current[30]).toBe(1199);
    expect(r.previousAtSameDay).toBe(550);
    expect(r.difference).toBe(649);
  });

  it("has nothing to compare with before the period starts or without previous spending", () => {
    const before = runningTotals({ ...base, today: "2026-09-15" });
    expect(before.elapsed).toBe(0);
    expect(before.current).toEqual([]);
    expect(before.projected).toBeNull();
    expect(before.previousAtSameDay).toBeNull();
    const noPrevious = runningTotals({ ...base, previousDaily: new Map() });
    expect(noPrevious.previousAtSameDay).toBeNull();
    expect(noPrevious.difference).toBeNull();
  });
});

describe("monthOfPeriod", () => {
  it("names calendar months and budget periods by their middle day", () => {
    expect(monthOfPeriod("2026-10-01", "2026-10-31")).toBe("2026-10");
    expect(monthOfPeriod("2026-02-01", "2026-02-28")).toBe("2026-02");
    expect(monthOfPeriod("2026-09-23", "2026-10-22")).toBe("2026-10");
    expect(monthOfPeriod("2026-09-08", "2026-10-07")).toBe("2026-09");
  });

  it("has no month for weeks, quarters or other ranges", () => {
    expect(monthOfPeriod("2026-10-01", "2026-10-07")).toBeNull();
    expect(monthOfPeriod("2026-07-01", "2026-09-30")).toBeNull();
  });
});

describe("blockMapLayout", () => {
  const b = (name: string, value: number) => ({ name, value });

  it("puts the largest block in its own column and balances the rest over two rows", () => {
    const { lead, rows } = blockMapLayout([b("Transport", 167), b("Housing", 501), b("Shopping", 237), b("Food", 306), b("Subscriptions", 111)]);
    expect(lead?.name).toBe("Housing");
    expect(rows.map((r) => r.map((x) => x.name))).toEqual([
      ["Food", "Subscriptions"],
      ["Shopping", "Transport"],
    ]);
  });

  it("gives a single remaining block the full height and leaves out empty ones", () => {
    expect(blockMapLayout([b("A", 10), b("B", 4), b("C", 0)])).toEqual({ lead: b("A", 10), rows: [[b("B", 4)]] });
    expect(blockMapLayout([b("A", 10)])).toEqual({ lead: b("A", 10), rows: [] });
    expect(blockMapLayout([b("A", 0)])).toEqual({ lead: null, rows: [] });
  });
});

describe("balanceOf", () => {
  it("says how far spending is ahead of income", () => {
    expect(balanceOf(6481.99, 6707.75)).toEqual({ kind: "ahead", amount: 225.76 });
  });

  it("says what was kept when income covers spending", () => {
    expect(balanceOf(3000, 2500)).toEqual({ kind: "kept", amount: 500 });
  });

  it("has no comparison without income", () => {
    expect(balanceOf(0, 80)).toEqual({ kind: "noIncome", amount: 80 });
  });
});

describe("buildSummaryFacts", () => {
  const input: SummaryInput = {
    from: "2026-09-23",
    to: "2026-10-25",
    ongoing: true,
    income: 6481.99,
    expense: 6707.75,
    incomeChangePct: 312,
    expenseChangePct: 241,
    daysElapsed: 27,
    prevExpense: 2368.5,
    prevDays: 33,
    left: { amount: 412.8, perDay: 58.97, daysLeft: 7 },
    groups: [
      { name: "Finance", spent: 866.09 },
      { name: "Travel", spent: 1590.85 },
    ],
    categories: Array.from({ length: 12 }, (_, i) => ({ name: `c${i}`, spent: 10 + i, budget: null })),
    merchants: [
      { name: "Landal Greenparks", total: 1513.63, visits: 1 },
      { name: "Albert Heijn", total: 312.4, visits: 11 },
    ],
    largest: { name: "Landal Greenparks", amount: 1513.63, category: "Travel" },
    uncategorised: 38,
  };

  it("works out the per-day figures for this and last period", () => {
    const f = buildSummaryFacts(input);
    expect(f.avgPerDay).toBe(248.44);
    expect(f.prevAvgPerDay).toBe(71.77);
    expect(f.left).toEqual({ amount: 412.8, perDay: 58.97, daysLeft: 7 });
    expect(f.saved).toBe(-225.76);
  });

  it("picks the biggest group and the top merchant", () => {
    const f = buildSummaryFacts(input);
    expect(f.biggestGroup).toEqual({ name: "Travel", spent: 1590.85 });
    expect(f.topMerchant).toEqual({ name: "Landal Greenparks", total: 1513.63, visits: 1 });
  });

  it("puts what no group holds in Other, with its share and transactions", () => {
    const f = buildSummaryFacts(input);
    expect(f.other).toEqual({ amount: 4250.81, sharePct: 63, transactions: 38 });
  });

  it("keeps the lists short and leaves out what is missing", () => {
    const f = buildSummaryFacts({ ...input, prevExpense: 0, left: null, groups: [], merchants: [] });
    expect(f.categories).toHaveLength(8);
    expect(f.prevAvgPerDay).toBeNull();
    expect(f.left).toBeNull();
    expect(f.biggestGroup).toBeNull();
    expect(f.topMerchant).toBeNull();
    expect(f.other.sharePct).toBe(100);
  });
});

describe("toPeriodSummary", () => {
  const at = "2026-10-16T09:00:00.000Z";

  it("trims the answer and keeps three facts at most", () => {
    const s = toPeriodSummary({ headline: " Ahead of income. ", facts: ["a", " b ", "", "c", "d"], tip: "Keep it under €60." }, at);
    expect(s).toEqual({ headline: "Ahead of income.", facts: ["a", "b", "c"], tip: "Keep it under €60.", createdAt: at });
  });

  it("rejects answers without a headline, facts or tip, and old paragraph summaries", () => {
    expect(toPeriodSummary({ headline: "x", facts: [], tip: "y" }, at)).toBeNull();
    expect(toPeriodSummary({ headline: "", facts: ["a"], tip: "y" }, at)).toBeNull();
    expect(toPeriodSummary({ text: "A paragraph.", createdAt: at }, at)).toBeNull();
    expect(toPeriodSummary(null, at)).toBeNull();
  });
});

// Insights › Net worth: rebuilding each account's history and the month's changes.
import { describe, expect, it } from "vitest";
import {
  addDays,
  balanceSeries,
  biggestStep,
  contributionSeries,
  daysBetween,
  isStale,
  manualHistory,
  monthsBack,
  parseNetWorthRange,
  parseValueInput,
  rangeMonthCount,
  sampleDates,
  stackSeries,
  stepSeries,
  whatChanged,
} from "@/lib/net-worth-history";

describe("range", () => {
  it("reads the four ranges and defaults to 6 months", () => {
    expect(parseNetWorthRange("1y")).toBe("1y");
    expect(parseNetWorthRange("2y")).toBe("6m");
    expect(parseNetWorthRange(undefined)).toBe("6m");
    expect(rangeMonthCount("3m")).toBe(3);
  });

  it("goes back whole months, clamped to the shorter month", () => {
    expect(monthsBack("2026-10-21", 6)).toBe("2026-04-21");
    expect(monthsBack("2026-03-31", 1)).toBe("2026-02-28");
    expect(monthsBack("2026-01-15", 12)).toBe("2025-01-15");
  });

  it("counts days and steps through dates", () => {
    expect(daysBetween("2026-10-01", "2026-10-21")).toBe(20);
    expect(daysBetween("2026-10-21", "2026-10-01")).toBe(-20);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("spreads sample dates evenly, both ends included", () => {
    const dates = sampleDates("2026-04-21", "2026-10-21", 13);
    expect(dates).toHaveLength(13);
    expect(dates[0]).toBe("2026-04-21");
    expect(dates.at(-1)).toBe("2026-10-21");
    expect(sampleDates("2026-10-15", "2026-10-21", 13)).toHaveLength(7);
    expect(sampleDates("2026-10-21", "2026-10-21")).toEqual(["2026-10-21"]);
  });
});

describe("balanceSeries", () => {
  it("subtracts what moved after each date from today's balance", () => {
    const flows = [
      { date: "2026-10-01", amount: 2350 },
      { date: "2026-10-05", amount: -1200 },
      { date: "2026-10-20", amount: -50.5 },
    ];
    expect(balanceSeries(1284, flows, ["2026-09-30", "2026-10-01", "2026-10-10", "2026-10-21"])).toEqual([184.5, 2534.5, 1334.5, 1284]);
  });

  it("works the same for goal contributions", () => {
    expect(contributionSeries(6000, [{ date: "2026-10-01", amount: 150 }], ["2026-09-30", "2026-10-01"])).toEqual([5850, 6000]);
  });
});

describe("manual values", () => {
  it("merges the recorded history with the account's own value", () => {
    const points = manualHistory([{ date: "2026-06-12", value: 9800 }], { value: 9500, lastUpdated: "2026-08-01" }, "2026-10-21");
    expect(points).toEqual([
      { date: "2026-06-12", value: 9800 },
      { date: "2026-08-01", value: 9500 },
    ]);
  });

  it("dates a changed value without a last update on today", () => {
    expect(manualHistory([{ date: "2026-06-12", value: 9800 }], { value: 9500, lastUpdated: null }, "2026-10-21").at(-1)).toEqual({ date: "2026-10-21", value: 9500 });
    expect(manualHistory([{ date: "2026-06-12", value: 9800 }], { value: 9800, lastUpdated: null }, "2026-10-21")).toEqual([{ date: "2026-06-12", value: 9800 }]);
  });

  it("reads as the first known value before it and steps after", () => {
    const points = [
      { date: "2026-07-01", value: 100 },
      { date: "2026-09-01", value: 150 },
    ];
    expect(stepSeries(points, ["2026-05-01", "2026-07-01", "2026-08-15", "2026-10-01"])).toEqual([100, 100, 100, 150]);
    expect(stepSeries([], ["2026-05-01"])).toEqual([0]);
  });

  it("finds the biggest step inside the range", () => {
    const points = [
      { date: "2026-01-01", value: 100 },
      { date: "2026-07-01", value: 300 },
      { date: "2026-09-01", value: 250 },
    ];
    expect(biggestStep(points, "2026-04-21", "2026-10-21")).toEqual({ date: "2026-07-01", delta: 200 });
    expect(biggestStep(points, "2026-09-01", "2026-10-21")).toBeNull();
  });

  it("calls a value stale after 60 days, or when it was never dated", () => {
    expect(isStale("2026-06-12", "2026-10-21")).toBe(true);
    expect(isStale("2026-10-02", "2026-10-21")).toBe(false);
    expect(isStale(null, "2026-10-21")).toBe(true);
  });
});

describe("stackSeries", () => {
  it("stacks assets per kind, puts the largest debt on its own band and nets them", () => {
    const s = stackSeries(
      [
        { key: "bank", side: "asset", kind: "cash", values: [1000, 1200] },
        { key: "fund", side: "asset", kind: "investments", values: [500, 600] },
        { key: "car", side: "asset", kind: "things", values: [9500, 9500] },
        { key: "duo", side: "debt", values: [19000, 18730] },
        { key: "visa", side: "debt", values: [500, 468] },
      ],
      2,
    );
    expect(s.assets).toEqual([11000, 11300]);
    expect(s.mainDebtKey).toBe("duo");
    expect(s.otherDebts).toEqual([500, 468]);
    expect(s.debts).toEqual([19500, 19198]);
    expect(s.net).toEqual([-8500, -7898]);
  });

  it("is all zeros without accounts", () => {
    const s = stackSeries([], 3);
    expect(s.net).toEqual([0, 0, 0]);
    expect(s.mainDebtKey).toBeNull();
  });
});

describe("whatChanged", () => {
  it("groups the month's changes and adds them up", () => {
    const { groups, total } = whatChanged([
      { key: "goal", group: "contributions", start: 5850, end: 6000 },
      { key: "car-loan", group: "debts", start: 4295, end: 4120, owed: true },
      { key: "visa", group: "debts", start: 455, end: 468, owed: true },
      { key: "fund", group: "manual", start: 18280, end: 18920 },
      { key: "bank", group: "cash", start: 3118, end: 1284 },
      { key: "still", group: "cash", start: 10, end: 10 },
    ]);
    expect(groups.map((g) => [g.group, g.total])).toEqual([
      ["contributions", 150],
      ["debts", 162],
      ["manual", 640],
      ["cash", -1834],
    ]);
    expect(groups[1].rows.map((r) => r.key)).toEqual(["car-loan", "visa"]);
    expect(total).toBe(-882);
  });
});

describe("parseValueInput", () => {
  it("reads Dutch and plain amounts", () => {
    expect(parseValueInput("18.920")).toBe(18920);
    expect(parseValueInput("18.920,50")).toBe(18920.5);
    expect(parseValueInput("€ 9.500")).toBe(9500);
    expect(parseValueInput("1234.5")).toBe(1234.5);
    expect(parseValueInput("0,99")).toBe(0.99);
  });

  it("is null for anything else", () => {
    expect(parseValueInput("")).toBeNull();
    expect(parseValueInput("abc")).toBeNull();
    expect(parseValueInput("1,2,3")).toBeNull();
  });
});

// Insights › Trends: the period, the month flows, the key figures, the movers and the
// category table rows.
import { describe, expect, it } from "vitest";
import {
  biggestMovers,
  budgetMonthsIn,
  categoryMonthly,
  categoryTrend,
  changeTone,
  classifyRow,
  dominantMerchant,
  fromFirstData,
  hasData,
  incomeStandsOut,
  keptSummary,
  monthFlows,
  monthsBefore,
  parseTrendsRange,
  planSplit,
  trendsMonths,
  type TrendsRow,
} from "@/lib/trends";
import { compactTick, niceRange, niceStep } from "@/lib/chart-scale";

const FM = { defaultStartDay: 1 };

function row(partial: Partial<TrendsRow>): TrendsRow {
  return {
    month: "2026-05",
    direction: "expense",
    amount: 10,
    categoryId: 1,
    categoryGroup: "",
    budgetType: "nodig",
    isReimbursement: false,
    isInternalTransfer: false,
    ...partial,
  };
}

describe("parseTrendsRange", () => {
  it("reads 3, 6 and 12 months", () => {
    expect(parseTrendsRange({ range: "3" })).toEqual({ kind: "months", count: 3 });
    expect(parseTrendsRange({ range: "12" })).toEqual({ kind: "months", count: 12 });
  });

  it("reads a custom period from from/to", () => {
    expect(parseTrendsRange({ from: "2026-01-01", to: "2026-03-31" })).toEqual({ kind: "custom", from: "2026-01-01", to: "2026-03-31" });
    expect(parseTrendsRange({ range: "custom", from: "2026-01-01", to: "2026-03-31" }).kind).toBe("custom");
  });

  it("falls back to 6 months on anything else", () => {
    expect(parseTrendsRange({})).toEqual({ kind: "months", count: 6 });
    expect(parseTrendsRange({ range: "7" })).toEqual({ kind: "months", count: 6 });
    expect(parseTrendsRange({ from: "2026-05-01", to: "2026-01-01" })).toEqual({ kind: "months", count: 6 });
    expect(parseTrendsRange({ from: "May", to: "June" })).toEqual({ kind: "months", count: 6 });
  });

  it("prefers a picked from/to over range (the range links drop from/to)", () => {
    expect(parseTrendsRange({ range: "3", from: "2026-01-01", to: "2026-03-31" }).kind).toBe("custom");
    expect(parseTrendsRange({ range: "3", from: "2026-01-01" })).toEqual({ kind: "months", count: 3 });
  });
});

describe("trendsMonths", () => {
  it("counts back from the current month", () => {
    expect(trendsMonths({ kind: "months", count: 3 }, "2026-10", FM)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(trendsMonths({ kind: "months", count: 6 }, "2026-02", FM)[0]).toBe("2025-09");
  });

  it("keeps a custom period's started months only", () => {
    expect(trendsMonths({ kind: "custom", from: "2026-01-01", to: "2026-12-31" }, "2026-03", FM)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(trendsMonths({ kind: "custom", from: "2027-01-01", to: "2027-03-31" }, "2026-03", FM)).toEqual(["2026-03"]);
  });

  it("names budget months after the month they end in", () => {
    // Budget months from the 25th: 25 Dec – 24 Jan is keyed 2025-12 and ends in January.
    expect(budgetMonthsIn("2026-01-01", "2026-03-31", { defaultStartDay: 25 })).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  it("lists the months before", () => {
    expect(monthsBefore(["2026-05", "2026-06"])).toEqual(["2026-03", "2026-04"]);
    expect(monthsBefore(["2026-01"], 2)).toEqual(["2025-11", "2025-12"]);
    expect(monthsBefore([])).toEqual([]);
  });
});

describe("classifyRow and monthFlows", () => {
  it("leaves transfers and reimbursements out and counts savings as saved", () => {
    expect(classifyRow(row({ isInternalTransfer: true }))).toBeNull();
    expect(classifyRow(row({ direction: "income", isReimbursement: true }))).toBeNull();
    expect(classifyRow(row({ categoryGroup: "savings" }))).toBe("saved");
    expect(classifyRow(row({ categoryGroup: "savings", direction: "income" }))).toBeNull();
    expect(classifyRow(row({ direction: "income", budgetType: null }))).toBe("income");
    expect(classifyRow(row({ budgetType: "needs" }))).toBe("needs");
    expect(classifyRow(row({ budgetType: "willen" }))).toBe("wants");
    expect(classifyRow(row({ budgetType: null, categoryId: null }))).toBe("wants");
  });

  it("adds up per month, with zeros for empty months", () => {
    const flows = monthFlows(
      [
        row({ amount: 100.1 }),
        row({ amount: 50.2, budgetType: "willen" }),
        row({ direction: "income", amount: 3000, budgetType: null }),
        row({ categoryGroup: "savings", amount: 200 }),
        row({ month: "2026-04", amount: 999 }),
      ],
      ["2026-05", "2026-06"],
    );
    expect(flows[0]).toEqual({ month: "2026-05", income: 3000, needs: 100.1, wants: 50.2, saved: 200, expense: 150.3 });
    expect(flows[1]).toEqual({ month: "2026-06", income: 0, needs: 0, wants: 0, saved: 0, expense: 0 });
  });

  it("totals spending per category per month, needs and wants only", () => {
    const map = categoryMonthly(
      [row({ amount: 10 }), row({ amount: 5 }), row({ categoryGroup: "savings", amount: 50 }), row({ direction: "income", amount: 9, budgetType: null }), row({ categoryId: null })],
      ["2026-05"],
    );
    expect(map.get(1)).toEqual({ "2026-05": 15 });
    expect(map.size).toBe(1);
  });
});

describe("fromFirstData", () => {
  const empty = { income: 0, needs: 0, wants: 0, saved: 0, expense: 0 };
  it("drops the months before the first one with data", () => {
    const flows = [
      { month: "2026-05", ...empty },
      { month: "2026-06", ...empty, income: 10 },
      { month: "2026-07", ...empty },
    ];
    expect(fromFirstData(flows).map((f) => f.month)).toEqual(["2026-06", "2026-07"]);
    expect(hasData(flows[0])).toBe(false);
  });

  it("keeps every month when none has data", () => {
    expect(fromFirstData([{ month: "2026-05", ...empty }])).toHaveLength(1);
  });
});

describe("keptSummary", () => {
  const flows = [
    { month: "2026-05", income: 5000, needs: 1800, wants: 1000, saved: 0, expense: 2800 },
    { month: "2026-06", income: 3000, needs: 1800, wants: 1300, saved: 0, expense: 3100 },
    { month: "2026-07", income: 3000, needs: 1500, wants: 900, saved: 0, expense: 2400 },
    { month: "2026-08", income: 500, needs: 900, wants: 100, saved: 0, expense: 1000 },
  ];

  it("averages the finished months only", () => {
    const s = keptSummary(flows, "2026-08");
    expect(s.finished).toBe(3);
    expect(s.avgIncome).toBe(3666.67);
    expect(s.avgExpense).toBe(2766.67);
    expect(s.kept).toBe(900);
    expect(s.positive).toBe(2);
    expect(s.peakIncome?.month).toBe("2026-05");
    expect(s.peakExpense?.month).toBe("2026-06");
  });

  it("falls back to every month when none has finished", () => {
    const s = keptSummary(flows.slice(3), "2026-08");
    expect(s.finished).toBe(0);
    expect(s.avgIncome).toBe(500);
  });

  it("spots a month whose income stands out", () => {
    const s = keptSummary(flows, "2026-08");
    expect(incomeStandsOut(s.basis, s.peakIncome)).toBe(true);
    expect(incomeStandsOut(flows.slice(1, 3), flows[1])).toBe(false);
  });
});

describe("planSplit", () => {
  it("compares the shares of income with the plan", () => {
    const split = planSplit([{ month: "m", income: 1000, needs: 520, wants: 280, saved: 180, expense: 800 }], { nodig: 50, willen: 30, sparen: 20 });
    expect(split).toEqual({ needs: 52, wants: 28, savings: 18, needsOk: false, wantsOk: true, savingsOk: false });
  });

  it("is null without income", () => {
    expect(planSplit([{ month: "m", income: 0, needs: 10, wants: 0, saved: 0, expense: 10 }], { nodig: 50, willen: 30, sparen: 20 })).toBeNull();
  });
});

describe("biggestMovers", () => {
  const items = [
    { id: 1, name: "Holidays", after: 236, before: 85 },
    { id: 2, name: "Restaurants", after: 272, before: 198 },
    { id: 3, name: "Energy", after: 143, before: 198 },
    { id: 4, name: "Rent", after: 1045, before: 1045 },
    { id: 5, name: "Coffee", after: 23, before: 20 },
  ];

  it("lists the largest changes both ways and the net change", () => {
    const { up, down, net } = biggestMovers(items);
    expect(up.map((m) => m.name)).toEqual(["Holidays", "Restaurants"]);
    expect(down.map((m) => [m.name, m.delta])).toEqual([["Energy", -55]]);
    expect(net).toBe(173);
  });

  it("caps each side at the limit", () => {
    expect(biggestMovers(items, { limit: 1 }).up).toHaveLength(1);
  });
});

describe("dominantMerchant", () => {
  it("names a merchant behind most of the money", () => {
    expect(dominantMerchant([{ merchant: "Albert Heijn", amount: 60 }, { merchant: "Jumbo", amount: 30 }, { merchant: null, amount: 10 }])).toBe("Albert Heijn");
  });

  it("is null when the money is spread out", () => {
    expect(dominantMerchant([{ merchant: "A", amount: 40 }, { merchant: "B", amount: 60 }], 0.7)).toBeNull();
    expect(dominantMerchant([])).toBeNull();
  });
});

describe("categoryTrend", () => {
  const months = ["2026-08", "2026-09", "2026-10"];

  it("averages finished months, keeps the running month apart and compares with before", () => {
    const tr = categoryTrend({ "2026-08": 20, "2026-09": 34, "2026-10": 292 }, months, "2026-10", 132, 6);
    expect(tr.values).toEqual([20, 34, 292]);
    expect(tr.total).toBe(346);
    expect(tr.avg).toBe(27);
    expect(tr.current).toBe(292);
    expect(tr.vsBefore).toBe(5);
    expect(tr.spike).toBe(true);
  });

  it("has no running amount once every month has finished", () => {
    const tr = categoryTrend({ "2026-08": 10 }, months, null, 0, 0);
    expect(tr.current).toBeNull();
    expect(tr.avg).toBe(3.33);
    expect(tr.spike).toBe(false);
  });

  it("reads small changes as the same", () => {
    expect(changeTone(4.9)).toBe("same");
    expect(changeTone(-12)).toBe("down");
    expect(changeTone(46)).toBe("up");
  });
});

describe("chart scale", () => {
  it("rounds steps to 1, 2, 2.5 or 5", () => {
    expect(niceStep(1800)).toBe(2000);
    expect(niceStep(2300)).toBe(2500);
    expect(niceStep(0)).toBe(1);
  });

  it("keeps zero on the axis and lands on round numbers", () => {
    expect(niceRange(0, 5200)).toEqual({ lo: 0, hi: 6000, step: 2000, ticks: [0, 2000, 4000, 6000] });
    const r = niceRange(-23318, 52894);
    expect(r.lo).toBeLessThanOrEqual(-23318);
    expect(r.hi).toBeGreaterThanOrEqual(52894);
    expect(r.ticks).toContain(0);
  });

  it("writes compact tick labels", () => {
    expect(compactTick(0, "en-GB")).toBe("0");
    expect(compactTick(2500, "nl-NL")).toBe("2,5k");
    expect(compactTick(-25000, "en-GB")).toBe("−25k");
  });
});

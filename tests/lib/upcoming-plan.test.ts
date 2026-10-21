// Activity › Upcoming's sums (lib/upcoming-plan.ts): the grouped list, what leaves the
// account before payday, the running balance through the month and next month's preview.
import { describe, expect, it } from "vitest";
import {
  beforePayday,
  busiestDay,
  dotSize,
  groupUpcomingBills,
  previewNextMonth,
  runningBalance,
  weekEnd,
  type PlanBill,
  type PreviewItem,
} from "@/lib/upcoming-plan";

const today = "2026-10-21"; // a Wednesday
const from = "2026-10-01";
const to = "2026-10-31";

const bill = (name: string, dueDate: string | null, amount: number, extra: Partial<PlanBill> = {}): PlanBill => ({
  id: name.length * 100 + amount,
  name,
  amount,
  dueDate,
  paid: false,
  overdue: false,
  isIncome: false,
  skipped: false,
  ...extra,
});

const october: PlanBill[] = [
  bill("Rent", "2026-10-01", 1045, { paid: true }),
  bill("Water", "2026-10-15", 28.5, { overdue: true }),
  bill("Gym", "2026-10-22", 34.99),
  bill("Health", "2026-10-25", 142),
  bill("Holiday fund", "2026-10-25", 150, { skipped: true }),
  bill("Phone", "2026-10-28", 22.5),
  bill("Salary", "2026-10-30", 2350, { isIncome: true }),
  bill("Car insurance", "2026-10-30", 50),
  bill("Gift", null, 10),
];

describe("weekEnd", () => {
  it("runs to Sunday, and a Sunday is its own week's end", () => {
    expect(weekEnd(today)).toBe("2026-10-25");
    expect(weekEnd("2026-10-25")).toBe("2026-10-25");
  });
});

describe("groupUpcomingBills", () => {
  it("splits the month in progress into Overdue, This week and Later, totals without income", () => {
    const { groups, done } = groupUpcomingBills(october, today, from, to);
    expect(groups.map((g) => [g.key, g.items.map((b) => b.name), g.total])).toEqual([
      ["overdue", ["Water"], 28.5],
      ["thisWeek", ["Gym", "Health"], 176.99],
      ["later", ["Phone", "Car insurance", "Salary", "Gift"], 82.5],
    ]);
    expect(done.map((b) => b.name)).toEqual(["Rent", "Holiday fund"]);
  });

  it("calls an ended month's open bills Not paid and a later month's Coming up", () => {
    expect(groupUpcomingBills(october, "2026-11-05", from, to).groups.map((g) => g.key)).toEqual(["notPaid"]);
    expect(groupUpcomingBills(october, "2026-09-20", from, to).groups.map((g) => g.key)).toEqual(["comingUp"]);
  });
});

describe("beforePayday", () => {
  it("adds up open bills up to the day before the income, overdue and day-less ones included", () => {
    expect(beforePayday(october, to, "2026-10-30")).toEqual({ amount: 237.99, count: 5, until: "2026-10-29" });
  });

  it("runs to the end of the month when no income is expected", () => {
    expect(beforePayday(october, to, null)).toMatchObject({ count: 6, until: to });
  });
});

describe("runningBalance", () => {
  const flows = new Map([
    ["2026-10-01", -1045],
    ["2026-10-10", -60],
    ["2026-10-21", -20],
  ]);

  it("works the month so far back from today's balance and steps through what is to come", () => {
    const r = runningBalance({ from, to, today, balanceNow: 1000, flows, bills: october });
    expect(r.past[0]).toEqual({ date: from, balance: 1080 }); // after the rent left
    expect(r.past.find((p) => p.date === "2026-10-10")?.balance).toBe(1020);
    expect(r.past.at(-1)).toEqual({ date: today, balance: 1000 });
    // Today: the overdue water and the day-less gift land at once.
    expect(r.future[0]).toEqual({ date: today, balance: 961.5 });
    expect(r.future.find((p) => p.date === "2026-10-25")?.balance).toBe(784.51);
    expect(r.lowest).toEqual({ date: "2026-10-28", balance: 762.01 });
    // Salary in, car insurance out on the 30th; the skipped savings never leave.
    expect(r.end).toBe(3062.01);
  });

  it("has only the past for an ended month, worked back through the days since", () => {
    const r = runningBalance({ from: "2026-09-01", to: "2026-09-30", today, balanceNow: 1000, flows, bills: [] });
    expect(r.future).toEqual([]);
    expect(r.past.at(-1)).toEqual({ date: "2026-09-30", balance: 2125 });
    expect(r.lowest).toBeNull();
  });
});

describe("dotSize and busiestDay", () => {
  it("sizes dots by amount and finds the day with the most going out", () => {
    expect([dotSize(20), dotSize(142), dotSize(1045)]).toEqual([5, 7, 9]);
    expect(busiestDay(october)).toEqual({ date: "2026-10-01", total: 1045 });
    expect(busiestDay(october.filter((b) => b.name !== "Rent"))).toEqual({ date: "2026-10-25", total: 142 });
  });
});

describe("previewNextMonth", () => {
  const item = (id: number, name: string, dueDate: string, amount: number, extra: Partial<PreviewItem> = {}): PreviewItem => ({
    id,
    name,
    amount,
    dueDate,
    isIncome: false,
    part: null,
    parts: null,
    ...extra,
  });
  const current = [
    item(1, "Rent", "2026-10-01", 1045),
    item(2, "Energy", "2026-10-03", 142),
    item(3, "Car insurance", "2026-10-30", 50, { nextDate: "2027-01-30" }),
    item(4, "Municipal tax", "2026-10-28", 61.2, { part: 8, parts: 10 }),
    item(9, "Salary", "2026-10-30", 2350, { isIncome: true }),
  ];
  const next = [
    item(1, "Rent", "2026-11-01", 1045),
    item(2, "Energy", "2026-11-03", 142),
    item(4, "Municipal tax", "2026-11-28", 61.2, { part: 9, parts: 10 }),
    item(5, "Washing machine", "2026-11-16", 183, { part: 1, parts: 3 }),
    item(9, "Salary", "2026-11-30", 2350, { isIncome: true }),
  ];

  it("shows what is new and what drops out first, by date, then the biggest of the rest", () => {
    const p = previewNextMonth(current, next, 3);
    expect(p.rows.map((r) => [r.kind, r.item.name])).toEqual([
      ["same", "Rent"],
      ["new", "Washing machine"],
      ["skips", "Car insurance"],
    ]);
    expect(p.more).toBe(2);
    expect(p.bills).toBeCloseTo(1431.2);
    expect(p.billCount).toBe(4);
    expect(p.income).toBe(2350);
    expect(p.diff).toBeCloseTo(1431.2 - 1298.2);
  });
});

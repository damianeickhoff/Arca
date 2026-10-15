// Home's "Safe to spend": budget − spent − bills still to come that count toward it.
import { describe, expect, it } from "vitest";
import { budgetSpendByDay, safeToSpend, type UpcomingBill } from "@/lib/safe-to-spend";
import type { BudgetCategoryRow } from "@/lib/budget-overview";

function cat(categoryId: number, budget: number | null): BudgetCategoryRow {
  return { categoryId, categoryName: `c${categoryId}`, color: null, icon: null, parentCategoryId: null, budgetType: "willen", budget, spent: 0, last30: 0 };
}

const overview = {
  budget: { id: 1, amount: 3000, period: "monthly" as const },
  allocated: 1720,
  totalSpent: 1742.6,
  budgetedSpent: 1322,
  from: "2026-09-25",
  to: "2026-10-24",
  // 10 = Leisure (budgeted), 11 = Subscriptions (variable, no budget)
  categories: [cat(10, 200), cat(11, null)],
};

const gym: UpcomingBill = { categoryId: 10, amount: 34.99, dueDate: "2026-10-22", isIncome: false };
const streaming: UpcomingBill = { categoryId: 11, amount: 13.99, dueDate: "2026-10-20", isIncome: false };
const energy: UpcomingBill = { categoryId: 99, amount: 142, dueDate: "2026-10-18", isIncome: false }; // fixed category
const salary: UpcomingBill = { categoryId: null, amount: 3650, dueDate: "2026-10-24", isIncome: true };
const today = "2026-10-15";

describe("safeToSpend", () => {
  it("is null without any budget", () => {
    expect(safeToSpend({ ...overview, budget: null, allocated: 0 }, [], "always", today)).toBeNull();
  });

  it("subtracts every variable-category bill in 'always' mode, never fixed bills or income", () => {
    const r = safeToSpend(overview, [gym, streaming, energy, salary], "always", today)!;
    expect(r.reserved).toBeCloseTo(34.99 + 13.99, 2);
    expect(r.amount).toBeCloseTo(3000 - 1742.6 - 48.98, 2);
  });

  it("only counts bills in budgeted categories in 'budgeted' mode", () => {
    const r = safeToSpend(overview, [gym, streaming], "budgeted", today)!;
    expect(r.reserved).toBeCloseTo(34.99, 2);
  });

  it("reserves nothing when recurring bills are excluded from budgets", () => {
    const r = safeToSpend(overview, [gym, streaming], "exclude", today)!;
    expect(r.reserved).toBe(0);
    expect(r.amount).toBeCloseTo(1257.4, 2);
  });

  it("uses the category budgets when there is no overall budget", () => {
    const r = safeToSpend({ ...overview, budget: null }, [gym, streaming], "always", today)!;
    expect(r.target).toBe(1720);
    expect(r.spent).toBe(1322);
    expect(r.reserved).toBeCloseTo(34.99, 2); // streaming's category has no budget
  });

  it("ignores bills due after the period or already in the past", () => {
    const late = { ...gym, dueDate: "2026-10-30" };
    const past = { ...gym, dueDate: "2026-10-10" };
    expect(safeToSpend(overview, [late, past], "always", today)!.reserved).toBe(0);
  });

  it("spreads what is left over the days left, today included, and resets the next day", () => {
    const r = safeToSpend(overview, [], "always", today)!;
    expect(r.perDay).toBeCloseTo(1257.4 / 10, 2);
    expect(r.resetsOn).toBe("2026-10-25");
    expect(r.elapsed).toBeCloseTo(20 / 30, 5);
  });

  it("reports the pace: on pace, fast, or over", () => {
    expect(safeToSpend(overview, [], "always", today)!.pace).toBe("onPace");
    expect(safeToSpend({ ...overview, totalSpent: 2300 }, [], "always", today)!.pace).toBe("fast");
    const over = safeToSpend({ ...overview, totalSpent: 3100 }, [], "always", today)!;
    expect(over.pace).toBe("over");
    expect(over.perDay).toBe(0);
  });
});

describe("budgetSpendByDay", () => {
  const entries = [
    { date: "2026-09-25", amount: 40, categoryId: 10, recurring: false },
    { date: "2026-09-27", amount: 15, categoryId: 11, recurring: false },
    { date: "2026-09-27", amount: 34.99, categoryId: 10, recurring: true }, // gym
    { date: "2026-09-28", amount: 950, categoryId: 99, recurring: true }, // rent, fixed category
    { date: "2026-09-20", amount: 99, categoryId: 10, recurring: false }, // before the period
    { date: "2026-10-16", amount: 99, categoryId: 10, recurring: false }, // after today
  ];

  it("accumulates per day up to today, leaving out other categories and other periods", () => {
    const days = budgetSpendByDay(entries, overview, "always", today);
    expect(days).toHaveLength(21); // 25 Sep – 15 Oct
    expect(days[0]).toBe(40);
    expect(days[1]).toBe(40);
    expect(days[2]).toBeCloseTo(40 + 15 + 34.99, 2);
    expect(days.at(-1)).toBeCloseTo(89.99, 2);
  });

  it("follows the recurring mode and the category budgets", () => {
    expect(budgetSpendByDay(entries, overview, "exclude", today).at(-1)).toBe(55);
    expect(budgetSpendByDay(entries, { ...overview, budget: null }, "always", today).at(-1)).toBeCloseTo(74.99, 2);
  });

  it("stops at the period's last day once it has passed", () => {
    expect(budgetSpendByDay([], overview, "always", "2026-11-03")).toHaveLength(30);
  });
});

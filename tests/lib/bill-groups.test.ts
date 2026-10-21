// The bill lists' pure helpers (lib/bill-groups.ts): which status control a row gets,
// the Budget card's Overdue / Coming up / paid grouping and its folded paid row, and the
// Needs a category summary (lib/needs-review-summary.ts).
import { describe, expect, it } from "vitest";
import { billControl, foldSummary, groupBudgetBills } from "@/lib/bill-groups";
import { summarizeNeedsReview } from "@/lib/needs-review-summary";

const today = "2026-10-21";

describe("billControl", () => {
  it("shows auto for a bill Arca can tick off itself", () => {
    expect(billControl({ paid: false, paidSource: null, hasPattern: true, dueDate: "2026-10-25" }, today)).toBe("auto");
    expect(billControl({ paid: true, paidSource: "match", hasPattern: true, dueDate: "2026-10-01" }, today)).toBe("auto");
  });

  it("shows Paid once a bill with a pattern is due and nothing matched", () => {
    expect(billControl({ paid: false, paidSource: null, hasPattern: true, dueDate: "2026-10-15" }, today)).toBe("pay");
    expect(billControl({ paid: false, paidSource: null, hasPattern: true, dueDate: today }, today)).toBe("pay");
  });

  it("asks Paid? when there is no pattern, whatever the date", () => {
    expect(billControl({ paid: false, paidSource: null, hasPattern: false, dueDate: "2026-10-30" }, today)).toBe("ask");
    expect(billControl({ paid: false, paidSource: null, hasPattern: false, dueDate: null }, today)).toBe("ask");
  });

  it("lets a mark made by hand be undone", () => {
    expect(billControl({ paid: true, paidSource: "manual", hasPattern: false, dueDate: "2026-10-03" }, today)).toBe("paid");
  });
});

describe("groupBudgetBills", () => {
  const bill = (name: string, dueDate: string | null, paid = false, overdue = false, isIncome = false) =>
    ({ name, amount: 10, dueDate, paid, overdue, isIncome });

  it("puts overdue first, then what is to come by date, a bill without a day last, paid apart, income out", () => {
    const groups = groupBudgetBills([
      bill("Phone", "2026-10-28"),
      bill("Gift", null),
      bill("Water", "2026-10-15", false, true),
      bill("Rent", "2026-10-01", true),
      bill("Gym", "2026-10-22"),
      bill("Salary", "2026-10-30", false, false, true),
    ]);
    expect(groups.overdue.map((b) => b.name)).toEqual(["Water"]);
    expect(groups.comingUp.map((b) => b.name)).toEqual(["Gym", "Phone", "Gift"]);
    expect(groups.paid.map((b) => b.name)).toEqual(["Rent"]);
  });
});

describe("foldSummary", () => {
  it("names the first three and counts the rest", () => {
    const paid = ["Rent", "Energy", "Spotify", "Water", "Gym"].map((name) => ({ name, amount: 20 }));
    expect(foldSummary(paid)).toEqual({ count: 5, total: 100, names: ["Rent", "Energy", "Spotify"], more: 2 });
  });

  it("names a weekly bill once and leaves income out", () => {
    const paid = [
      { name: "Cleaner", amount: 40 },
      { name: "Cleaner", amount: 40 },
      { name: "Salary", amount: 2000, isIncome: true },
    ];
    expect(foldSummary(paid)).toEqual({ count: 2, total: 80, names: ["Cleaner"], more: 0 });
  });
});

describe("summarizeNeedsReview", () => {
  const row = (description: string, amount: number, merchantId: number | null = null, merchantName: string | null = null) => ({
    amount,
    correctedAmount: null,
    description,
    customName: null,
    recurringFriendlyName: null,
    merchantId,
    merchantName,
  });

  it("counts, adds up and ranks the merchants", () => {
    const s = summarizeNeedsReview([
      row("BOL.COM 1", 20, 1, "Bol.com"),
      row("BOL.COM 2", 30, 1, "Bol.com"),
      row("BOL.COM 3", 10, 1, "Bol.com"),
      row("Tikkie a", 5, 2, "Tikkie"),
      row("Tikkie b", 5, 2, "Tikkie"),
      row("Kiosk", 3.5),
      row("Bakker", 2),
    ]);
    expect(s.count).toBe(7);
    expect(s.total).toBe(75.5);
    expect(s.top).toEqual([
      { name: "Bol.com", count: 3 },
      { name: "Tikkie", count: 2 },
      { name: "Bakker", count: 1 },
    ]);
    expect(s.otherMerchants).toBe(1);
  });
});

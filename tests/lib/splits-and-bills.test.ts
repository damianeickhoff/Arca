// Characterisation tests for transaction-splits.ts and bill-amounts.ts (both pure).
import { describe, expect, it } from "vitest";
import {
  allocateByCounts,
  amountsMatch,
  buildSplitAllocations,
  getDisplayedTransactionCategory,
  getTransactionSplitTotal,
  groupTransactionSplits,
  roundToCents,
  summarizeSplitCategories,
  type TransactionSplitRow,
} from "@/lib/transaction-splits";
import { billsDueTotal, hasPayableBill } from "@/lib/bill-amounts";

describe("cents helpers", () => {
  it("roundToCents uses Math.round on cents, float noise included", () => {
    expect(roundToCents(1.005)).toBe(1);
    expect(roundToCents(1.006)).toBe(1.01);
    expect(roundToCents(-2.345)).toBe(-2.35);
  });

  it("amountsMatch tolerates sub-cent noise only", () => {
    expect(amountsMatch(0.1 + 0.2, 0.3)).toBe(true);
    expect(amountsMatch(1, 1.01)).toBe(false);
  });

  it("getTransactionSplitTotal prefers the corrected amount", () => {
    expect(getTransactionSplitTotal(10, null)).toBe(10);
    expect(getTransactionSplitTotal(10, 7.5)).toBe(7.5);
    expect(getTransactionSplitTotal(10, 0)).toBe(0);
  });
});

describe("allocateByCounts", () => {
  it("spreads cents by largest remainder and always sums to the total", () => {
    expect(allocateByCounts(10, [1, 1, 1])).toEqual([3.34, 3.33, 3.33]);
    expect(allocateByCounts(100, [3, 1])).toEqual([75, 25]);
    const parts = allocateByCounts(25.75, [6000, 4300]);
    expect(parts).toEqual([15, 10.75]);
  });

  it("handles empty, zero and negative counts", () => {
    expect(allocateByCounts(10, [])).toEqual([]);
    expect(allocateByCounts(10, [0, 0])).toEqual([0, 0]);
    expect(allocateByCounts(10, [-5, 5])).toEqual([0, 10]);
  });
});

describe("grouping and labels", () => {
  it("groups splits per transaction ordered by position", () => {
    const grouped = groupTransactionSplits([
      { transactionId: 1, position: 2, id: "b" },
      { transactionId: 2, position: 0, id: "c" },
      { transactionId: 1, position: 1, id: "a" },
    ]);
    expect(grouped.get(1)!.map((s) => s.id)).toEqual(["a", "b"]);
    expect(grouped.get(2)!.map((s) => s.id)).toEqual(["c"]);
  });

  it("summarizeSplitCategories de-duplicates and falls back to a Dutch label", () => {
    expect(summarizeSplitCategories(["Food", " Food ", null, "Home"])).toBe("Food + Home");
    expect(summarizeSplitCategories([null, "  "])).toBe("Onbekende categorie");
  });

  it("getDisplayedTransactionCategory clears the category for split transactions", () => {
    const tx = { id: 1, date: "2026-03-01", direction: "expense", amount: 10, categoryId: 5, categoryName: "Food" };
    expect(getDisplayedTransactionCategory(tx, [])).toMatchObject({ isSplit: false, categoryId: 5, categoryName: "Food" });
    const splits = [
      { id: 1, transactionId: 1, amount: 6, categoryId: 5, position: 0, categoryName: "Food" },
      { id: 2, transactionId: 1, amount: 4, categoryId: 6, position: 1, categoryName: "Home" },
    ];
    expect(getDisplayedTransactionCategory(tx, splits)).toMatchObject({
      isSplit: true,
      splitCount: 2,
      splitSummary: "Food + Home",
      categoryId: null,
    });
  });
});

describe("buildSplitAllocations", () => {
  const base = { date: "2026-03-05", direction: "expense", categoryId: 1, categoryName: "Groceries", categoryGroup: "variable" };

  it("yields one allocation per unsplit transaction at its gross (corrected) amount", () => {
    const allocations = buildSplitAllocations(
      [
        { id: 1, ...base, amount: 50 },
        { id: 2, ...base, amount: 80, correctedAmount: 60, isInternalTransfer: true },
      ],
      new Map(),
    );
    expect(allocations).toEqual([
      expect.objectContaining({ transactionId: 1, amount: 50, isReimbursement: false, isInternalTransfer: false, categoryId: 1 }),
      expect.objectContaining({ transactionId: 2, amount: 60, isInternalTransfer: true }),
    ]);
  });

  it("expands a split transaction into its splits, carrying split categories", () => {
    const splits: TransactionSplitRow[] = [
      { id: 10, transactionId: 1, amount: 60, categoryId: 2, position: 0, categoryName: "Home" },
      { id: 11, transactionId: 1, amount: 43, categoryId: 3, position: 1, categoryName: "Fun" },
    ];
    const allocations = buildSplitAllocations([{ id: 1, ...base, amount: 103 }], new Map([[1, splits]]));
    expect(allocations.map((a) => [a.categoryId, a.amount, a.categoryName])).toEqual([
      [2, 60, "Home"],
      [3, 43, "Fun"],
    ]);
  });

  it("ignores reimbursedAmount unless netReimbursements is on", () => {
    const tx = { id: 1, ...base, amount: 103, reimbursedAmount: 77.25 };
    expect(buildSplitAllocations([tx], new Map())[0].amount).toBe(103);
    expect(buildSplitAllocations([tx], new Map(), { netReimbursements: true })[0].amount).toBe(25.75);
  });

  it("nets proportionally across splits and clamps to the transaction total", () => {
    const splits: TransactionSplitRow[] = [
      { id: 10, transactionId: 1, amount: 60, categoryId: 2, position: 0 },
      { id: 11, transactionId: 1, amount: 43, categoryId: 3, position: 1 },
    ];
    const netted = buildSplitAllocations([{ id: 1, ...base, amount: 103, reimbursedAmount: 77.25 }], new Map([[1, splits]]), {
      netReimbursements: true,
    });
    expect(netted.map((a) => a.amount)).toEqual([15, 10.75]);

    const over = buildSplitAllocations([{ id: 2, ...base, amount: 20, reimbursedAmount: 500 }], new Map(), { netReimbursements: true });
    expect(over[0].amount).toBe(0);
  });

  it("never nets income or reimbursement rows", () => {
    const rows = [
      { id: 1, ...base, direction: "income", amount: 100, reimbursedAmount: 40 },
      { id: 2, ...base, amount: 100, reimbursedAmount: 40, isReimbursement: true },
    ];
    expect(buildSplitAllocations(rows, new Map(), { netReimbursements: true }).map((a) => a.amount)).toEqual([100, 100]);
  });
});

describe("bill-amounts", () => {
  it("billsDueTotal sums payable bills only and treats a null amount as 0", () => {
    expect(
      billsDueTotal([
        { amount: 100 },
        { amount: 2500, isIncome: true },
        { amount: null },
        { amount: 12.5, isIncome: false },
      ]),
    ).toBe(112.5);
    expect(billsDueTotal([])).toBe(0);
  });

  it("hasPayableBill is false for an income-only list", () => {
    expect(hasPayableBill([{ isIncome: true }])).toBe(false);
    expect(hasPayableBill([{ isIncome: true }, {}])).toBe(true);
  });
});

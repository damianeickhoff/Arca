import { describe, expect, it } from "vitest";
import {
  bulkCategoryMoveEntry,
  categoryDeletedEntry,
  findUndoConflict,
  importEntry,
  merchantDeletedEntry,
  recurringDetectedEntry,
  refsIntersect,
  ruleCreatedEntry,
  ruleDeletedEntry,
  rulePassEntry,
  snapshotRefs,
  transactionFingerprint,
  type ConflictCandidate,
  type DeleteSnapshot,
} from "@/lib/activity-log-entries";

const entry = (id: number, refs: ConflictCandidate["refs"], undoneAt: string | null = null): ConflictCandidate => ({ id, kind: "x", refs, undoneAt });

describe("undo conflict check", () => {
  it("finds a later entry that touched the same rows", () => {
    const target = entry(5, { transactions: [1, 2, 3] });
    const hit = findUndoConflict(target, [entry(6, { transactions: [9] }), entry(7, { transactions: [3] })]);
    expect(hit?.id).toBe(7);
  });

  it("names the newest of several conflicting entries", () => {
    const target = entry(1, { transactions: [1] });
    expect(findUndoConflict(target, [entry(2, { transactions: [1] }), entry(4, { transactions: [1] }), entry(3, { transactions: [1] })])?.id).toBe(4);
  });

  it("ignores earlier entries, undone entries and other tables", () => {
    const target = entry(5, { transactions: [1], category_rules: [4] });
    expect(
      findUndoConflict(target, [
        entry(3, { transactions: [1] }), // earlier
        entry(6, { transactions: [1] }, "2026-10-19 10:00:00"), // undone
        entry(7, { categories: [1] }), // same id, other table
        entry(8, null),
      ]),
    ).toBeNull();
  });

  it("refsIntersect treats missing refs as no overlap", () => {
    expect(refsIntersect(null, { transactions: [1] })).toBe(false);
    expect(refsIntersect({ transactions: [] }, { transactions: [1] })).toBe(false);
    expect(refsIntersect({ merchants: [2] }, { merchants: [2, 3] })).toBe(true);
  });
});

describe("transaction fingerprint", () => {
  const row = { id: 1, date: "2026-10-01", amount: 12.5, description: "AH", category_id: 3, manually_categorized: 0, merchant_id: 8 };

  it("is stable and ignores derived columns", () => {
    expect(transactionFingerprint(row)).toBe(transactionFingerprint({ ...row }));
    expect(transactionFingerprint(row)).toBe(transactionFingerprint({ ...row, merchant_id: 9, id: 2 }));
  });

  it("changes when an editable column changes", () => {
    expect(transactionFingerprint(row)).not.toBe(transactionFingerprint({ ...row, category_id: 4 }));
    expect(transactionFingerprint(row)).not.toBe(transactionFingerprint({ ...row, notes: "hi" }));
  });
});

describe("entry builders", () => {
  it("import: deletes the inserted rows unless changed, nothing when nothing was inserted", () => {
    expect(importEntry([])).toBeNull();
    const e = importEntry([{ id: 4, amount: 1 }, { id: 5, amount: 2 }], { skipped: 3 })!;
    expect(e.kind).toBe("csvImport");
    expect(e.params).toMatchObject({ count: 2, skipped: 3 });
    expect(e.refs).toEqual({ transactions: [4, 5] });
    const op = e.undoData!.ops[0];
    expect(op.op).toBe("deleteUnchanged");
    if (op.op === "deleteUnchanged") expect(op.rows.map((r) => r.id)).toEqual([4, 5]);
  });

  it("rule pass: stores only the patched columns, before and after, as stored values", () => {
    expect(rulePassEntry([])).toBeNull();
    const e = rulePassEntry([
      { id: 1, before: { categoryId: 2, recurringItemId: null, isReimbursement: false }, patch: { categoryId: 7 } },
      { id: 2, before: { categoryId: null, recurringItemId: null, isReimbursement: false }, patch: { recurringItemId: 3, isReimbursement: true } },
    ])!;
    expect(e.params).toMatchObject({ count: 2, recategorised: 1 });
    expect(e.undoData!.ops).toEqual([
      {
        op: "update",
        table: "transactions",
        rows: [
          { id: 1, before: { category_id: 2 }, after: { category_id: 7 } },
          { id: 2, before: { recurring_item_id: null, is_reimbursement: 0 }, after: { recurring_item_id: 3, is_reimbursement: 1 } },
        ],
      },
    ]);
  });

  it("bulk move: previous category + manual flag, and the removed splits", () => {
    const e = bulkCategoryMoveEntry([{ id: 1, category_id: 2, manually_categorized: 0 }], 9, "Groceries", [{ id: 30, transaction_id: 1, amount: 5 }])!;
    expect(e.params).toEqual({ count: 1, category: "Groceries" });
    expect(e.refs).toEqual({ transactions: [1], transaction_splits: [30] });
    expect(e.undoData!.ops).toEqual([
      { op: "update", table: "transactions", rows: [{ id: 1, before: { category_id: 2, manually_categorized: 0 }, after: { category_id: 9, manually_categorized: 1 } }] },
      { op: "insert", table: "transaction_splits", rows: [{ id: 30, transaction_id: 1, amount: 5 }] },
    ]);
  });

  it("rule created / deleted", () => {
    const created = ruleCreatedEntry({ id: 3, name_pattern: "albert", category_id: 2 }, "Groceries");
    expect(created.params).toEqual({ pattern: "albert", category: "Groceries" });
    expect(created.undoData!.ops).toEqual([{ op: "delete", table: "category_rules", ids: [3] }]);

    const snapshot: DeleteSnapshot = { inserts: [{ table: "category_rules", rows: [{ id: 3, name_pattern: "albert" }] }], updates: [], complete: true };
    const deleted = ruleDeletedEntry(snapshot, "Groceries")!;
    expect(deleted.refs).toEqual({ category_rules: [3] });
    expect(deleted.undoData!.ops).toEqual([{ op: "insert", table: "category_rules", rows: [{ id: 3, name_pattern: "albert" }] }]);
  });

  it("category deleted: counts what went with it; an incomplete snapshot is not reversible", () => {
    const snapshot: DeleteSnapshot = {
      inserts: [
        { table: "categories", rows: [{ id: 2, name: "Fun" }] },
        { table: "transactions", rows: [{ id: 10 }, { id: 11 }] },
        { table: "category_rules", rows: [{ id: 4 }] },
      ],
      updates: [{ table: "transaction_splits", rows: [{ id: 50, before: { category_id: 2 }, after: { category_id: null } }] }],
      complete: true,
    };
    const e = categoryDeletedEntry(snapshot)!;
    expect(e.params).toEqual({ name: "Fun", transactions: 2, rules: 1 });
    expect(e.refs).toEqual({ categories: [2], transactions: [10, 11], category_rules: [4], transaction_splits: [50] });
    expect(e.undoData!.ops.map((o) => o.op)).toEqual(["insert", "insert", "insert", "update"]);
    expect(categoryDeletedEntry({ ...snapshot, complete: false })!.undoData).toBeNull();
    expect(snapshotRefs({ inserts: [], updates: [], complete: true })).toEqual({});
  });

  it("merchant deleted: restores the flag and relinks", () => {
    const e = merchantDeletedEntry({ id: 8, name: "AH" }, [1, 2]);
    expect(e.refs).toEqual({ merchants: [8], transactions: [1, 2] });
    expect(e.undoData!.ops[1]).toEqual({
      op: "update",
      table: "transactions",
      rows: [
        { id: 1, before: { merchant_id: 8 }, after: { merchant_id: null } },
        { id: 2, before: { merchant_id: 8 }, after: { merchant_id: null } },
      ],
    });
  });

  it("recurring detected: undo dismisses, then re-runs the rules", () => {
    expect(recurringDetectedEntry([])).toBeNull();
    const e = recurringDetectedEntry([{ id: 5, name: "Netflix" }])!;
    expect(e.params).toEqual({ count: 1, name: "Netflix" });
    expect(e.undoData!.rerunRules).toBe(true);
    expect(e.undoData!.ops[0]).toEqual({ op: "update", table: "recurring_items", rows: [{ id: 5, before: { dismissed: 1, active: 0 }, after: { dismissed: 0, active: 1 } }] });
  });
});

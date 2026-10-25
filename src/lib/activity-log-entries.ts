// The change log's pure half: what an entry looks like, how each kind of change is
// turned into one, and the undo-conflict check. No database access here, so it can be
// tested on its own — src/lib/activity-log.ts records, lists and undoes entries.
//
// Every row value in this file uses the database's own column names (snake_case) and
// SQLite's storage values (booleans as 0/1), since the undo engine reads and writes
// rows with raw SQL rather than through a per-table Drizzle schema.

export type ActivityKind =
  | "csvImport"
  | "bankSync"
  | "rulesApplied"
  | "bulkCategoryMove"
  | "ruleCreated"
  | "ruleDeleted"
  | "merchantDeleted"
  | "categoryDeleted"
  // Nothing writes this any more (the detector only suggests since then); kept so
  // entries already in users' change logs still render and undo.
  | "recurringDetected"
  | "recurringMigrated";

export const ACTIVITY_KINDS: readonly ActivityKind[] = [
  "csvImport",
  "bankSync",
  "rulesApplied",
  "bulkCategoryMove",
  "ruleCreated",
  "ruleDeleted",
  "merchantDeleted",
  "categoryDeleted",
  "recurringDetected",
  "recurringMigrated",
];

export type DbValue = string | number | null;
export type DbRow = Record<string, DbValue>;

/** The rows a change touched, by table: `{ transactions: [1, 2], category_rules: [7] }`. */
export type ActivityRefs = Record<string, number[]>;

/**
 * One step of an undo, run in order inside one database transaction:
 *   • delete — remove rows this change created.
 *   • deleteUnchanged — remove imported transactions, but keep any that were edited,
 *     split or linked since (their fingerprint no longer matches).
 *   • update — put columns back to `before`, on rows that still hold `after` (a row
 *     changed again since is left alone).
 *   • insert — put back rows this change deleted, exactly as they were.
 */
export type UndoOp =
  | { op: "delete"; table: string; ids: number[] }
  | { op: "deleteUnchanged"; table: "transactions"; rows: { id: number; fp: string }[] }
  | { op: "update"; table: string; rows: { id: number; before: DbRow; after: DbRow }[] }
  | { op: "insert"; table: string; rows: DbRow[] };

export interface UndoData {
  ops: UndoOp[];
  /** Re-run the rule pass afterwards (e.g. so transactions drop a dismissed recurring item). */
  rerunRules?: boolean;
}

export type ActivityParams = Record<string, string | number | null>;

/** What a code path hands to recordActivity(). */
export interface ActivityEntryInput {
  kind: ActivityKind;
  params: ActivityParams;
  affectedCount: number;
  refs: ActivityRefs;
  undoData: UndoData | null;
}

/** SQLite's storage value: booleans become 0/1, undefined becomes null. */
export function toDbValue(value: unknown): DbValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

// ─── Fingerprints ─────────────────────────────────────────────────────────────

// The columns a person (or a logged change) edits. An imported row whose fingerprint
// over these still matches has not been touched since the import. Derived columns the
// app fills in by itself later (merchant, brand icon, recurring link) are left out, so
// opening a transaction — which can link its merchant — doesn't count as an edit.
export const FINGERPRINT_COLUMNS = [
  "date",
  "amount",
  "corrected_amount",
  "description",
  "direction",
  "category_id",
  "manually_categorized",
  "notes",
  "custom_name",
  "budget_type_override",
  "is_manual_transfer",
  "is_reimbursement",
  "exclude_from_reports",
  "expected_reimbursement",
  "shared_with_count",
  "receipt_url",
  "goal_id",
  "transfer_type",
] as const;

/** A short FNV-1a hash of a transaction's editable columns. */
export function transactionFingerprint(row: DbRow): string {
  const text = FINGERPRINT_COLUMNS.map((c) => JSON.stringify(toDbValue(row[c]))).join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

// ─── Conflict check ───────────────────────────────────────────────────────────

/** The fields of a stored entry the conflict check needs. */
export interface ConflictCandidate {
  id: number;
  kind: string;
  refs: ActivityRefs | null;
  undoneAt: string | null;
}

export function refsIntersect(a: ActivityRefs | null, b: ActivityRefs | null): boolean {
  if (!a || !b) return false;
  for (const [table, ids] of Object.entries(a)) {
    const other = b[table];
    if (!other || other.length === 0 || ids.length === 0) continue;
    const set = new Set(other);
    if (ids.some((id) => set.has(id))) return true;
  }
  return false;
}

/**
 * The newest later change that touched any of the same rows and is still in effect —
 * undoing `entry` underneath it would silently throw its work away, so the undo is
 * refused until that one is undone first. Undone entries no longer count.
 */
export function findUndoConflict<T extends ConflictCandidate>(entry: ConflictCandidate, others: T[]): T | null {
  let hit: T | null = null;
  for (const other of others) {
    if (other.id <= entry.id || other.undoneAt) continue;
    if (!refsIntersect(entry.refs, other.refs)) continue;
    if (!hit || other.id > hit.id) hit = other;
  }
  return hit;
}

// ─── Entry builders ───────────────────────────────────────────────────────────

const ids = (rows: DbRow[]) => rows.map((r) => Number(r.id));

const importUndo = (inserted: DbRow[]): UndoData => ({
  ops: [{ op: "deleteUnchanged", table: "transactions", rows: inserted.map((r) => ({ id: Number(r.id), fp: transactionFingerprint(r) })) }],
});

/** Rows a CSV import inserted (as stored, after every pass the import ran). */
export function importEntry(inserted: DbRow[], params: { skipped?: number; source?: string | null } = {}): ActivityEntryInput | null {
  if (inserted.length === 0) return null;
  return {
    kind: "csvImport",
    params: { count: inserted.length, skipped: params.skipped ?? 0, source: params.source ?? null },
    affectedCount: inserted.length,
    refs: { transactions: ids(inserted) },
    undoData: importUndo(inserted),
  };
}

/** What one connection's sync run hands to bankSyncEntry besides the rows. */
export interface BankSyncParams {
  /** Rows that were already there (an earlier sync or a CSV import brought them in). */
  skipped?: number;
  /** The bank's name (bank_connections.aspsp_name). */
  source?: string | null;
  /** Set when the run failed: a BankSyncError code ("expired", "unavailable", …). */
  error?: string | null;
}

/**
 * One connection's sync run, always recorded — also when nothing was new, and when it
 * failed — so Settings › Import › Sync log shows every run. Params: `count` (inserted),
 * `skipped`, `source`, and `error` only on a failed run. Undo removes the inserted rows;
 * a run without rows (every failed one that stopped before importing anything) has
 * nothing to reverse and is stored without undo data. A run that failed on a later
 * account keeps the rows the earlier accounts brought in reversible.
 */
export function bankSyncEntry(inserted: DbRow[], params: BankSyncParams = {}): ActivityEntryInput {
  return {
    kind: "bankSync",
    params: {
      count: inserted.length,
      skipped: params.skipped ?? 0,
      source: params.source ?? null,
      ...(params.error ? { error: params.error } : {}),
    },
    affectedCount: inserted.length,
    refs: inserted.length ? { transactions: ids(inserted) } : {},
    undoData: inserted.length ? importUndo(inserted) : null,
  };
}

/** The column names a rule-pass patch writes, in the database's spelling. */
const RULE_PASS_COLUMNS: Record<string, string> = {
  categoryId: "category_id",
  recurringItemId: "recurring_item_id",
  isReimbursement: "is_reimbursement",
};

/** One transaction a rule pass changed: its previous values and the patch it got. */
export interface RulePassChangeInput {
  id: number;
  before: Record<string, unknown>;
  patch: Record<string, unknown>;
}

export function rulePassEntry(changes: RulePassChangeInput[]): ActivityEntryInput | null {
  if (changes.length === 0) return null;
  const rows = changes.map((c) => {
    const before: DbRow = {};
    const after: DbRow = {};
    for (const [key, value] of Object.entries(c.patch)) {
      const column = RULE_PASS_COLUMNS[key];
      if (!column) continue;
      before[column] = toDbValue(c.before[key]);
      after[column] = toDbValue(value);
    }
    return { id: c.id, before, after };
  });
  const recategorised = changes.filter((c) => "categoryId" in c.patch).length;
  return {
    kind: "rulesApplied",
    params: { count: changes.length, recategorised },
    affectedCount: changes.length,
    refs: { transactions: changes.map((c) => c.id) },
    undoData: { ops: [{ op: "update", table: "transactions", rows }] },
  };
}

/**
 * A bulk "move to category": every row's previous category and manual flag, plus the
 * splits the move removed (a moved transaction is no longer split).
 */
export function bulkCategoryMoveEntry(
  before: { id: number; category_id: DbValue; manually_categorized: DbValue }[],
  categoryId: number | null,
  categoryName: string | null,
  removedSplits: DbRow[],
): ActivityEntryInput | null {
  if (before.length === 0) return null;
  const ops: UndoOp[] = [
    {
      op: "update",
      table: "transactions",
      rows: before.map((r) => ({
        id: r.id,
        before: { category_id: toDbValue(r.category_id), manually_categorized: toDbValue(r.manually_categorized) },
        after: { category_id: categoryId, manually_categorized: 1 },
      })),
    },
  ];
  if (removedSplits.length > 0) ops.push({ op: "insert", table: "transaction_splits", rows: removedSplits });
  return {
    kind: "bulkCategoryMove",
    params: { count: before.length, category: categoryName },
    affectedCount: before.length,
    refs: { transactions: before.map((r) => r.id), ...(removedSplits.length ? { transaction_splits: ids(removedSplits) } : {}) },
    undoData: { ops },
  };
}

/** A rule's label in the log: its pattern, or its amount when it has no pattern. */
function ruleLabel(rule: DbRow): string | null {
  if (typeof rule.name_pattern === "string" && rule.name_pattern) return rule.name_pattern;
  if (rule.amount != null) return String(rule.amount);
  return null;
}

export function ruleCreatedEntry(rule: DbRow, categoryName: string | null): ActivityEntryInput {
  return {
    kind: "ruleCreated",
    params: { pattern: ruleLabel(rule), category: categoryName },
    affectedCount: 1,
    refs: { category_rules: [Number(rule.id)] },
    undoData: { ops: [{ op: "delete", table: "category_rules", ids: [Number(rule.id)] }] },
  };
}

/** A snapshot of everything a delete removes or clears (see snapshotDelete). */
export interface DeleteSnapshot {
  /** Deleted rows, the root's first, by table. */
  inserts: { table: string; rows: DbRow[] }[];
  /** Columns the delete set to null on rows that stay. */
  updates: { table: string; rows: { id: number; before: DbRow; after: DbRow }[] }[];
  /** False when some dependent rows couldn't be captured — the delete is then not reversible. */
  complete: boolean;
}

export function snapshotRefs(snapshot: DeleteSnapshot): ActivityRefs {
  const refs: ActivityRefs = {};
  const add = (table: string, list: number[]) => {
    if (list.length === 0) return;
    refs[table] = [...new Set([...(refs[table] ?? []), ...list])];
  };
  for (const s of snapshot.inserts) add(s.table, ids(s.rows));
  for (const s of snapshot.updates) add(s.table, s.rows.map((r) => r.id));
  return refs;
}

function snapshotUndo(snapshot: DeleteSnapshot): UndoData | null {
  if (!snapshot.complete) return null;
  const ops: UndoOp[] = [
    ...snapshot.inserts.filter((s) => s.rows.length > 0).map((s): UndoOp => ({ op: "insert", table: s.table, rows: s.rows })),
    ...snapshot.updates.filter((s) => s.rows.length > 0).map((s): UndoOp => ({ op: "update", table: s.table, rows: s.rows })),
  ];
  return { ops, rerunRules: true };
}

const countIn = (snapshot: DeleteSnapshot, table: string) => snapshot.inserts.filter((s) => s.table === table).reduce((n, s) => n + s.rows.length, 0);

export function ruleDeletedEntry(snapshot: DeleteSnapshot, categoryName: string | null): ActivityEntryInput | null {
  const rule = snapshot.inserts.find((s) => s.table === "category_rules")?.rows[0];
  if (!rule) return null;
  return {
    kind: "ruleDeleted",
    params: { pattern: ruleLabel(rule), category: categoryName },
    affectedCount: 1,
    refs: snapshotRefs(snapshot),
    undoData: snapshotUndo(snapshot),
  };
}

export function categoryDeletedEntry(snapshot: DeleteSnapshot): ActivityEntryInput | null {
  const category = snapshot.inserts.find((s) => s.table === "categories")?.rows[0];
  if (!category) return null;
  const transactions = countIn(snapshot, "transactions");
  return {
    kind: "categoryDeleted",
    params: { name: String(category.name ?? ""), transactions, rules: countIn(snapshot, "category_rules") },
    affectedCount: transactions,
    refs: snapshotRefs(snapshot),
    undoData: snapshotUndo(snapshot),
  };
}

/** A merchant soft-delete: the tombstone flag and the transactions it unlinked. */
export function merchantDeletedEntry(merchant: { id: number; name: string }, unlinkedTransactionIds: number[]): ActivityEntryInput {
  const ops: UndoOp[] = [{ op: "update", table: "merchants", rows: [{ id: merchant.id, before: { deleted: 0 }, after: { deleted: 1 } }] }];
  if (unlinkedTransactionIds.length > 0) {
    ops.push({
      op: "update",
      table: "transactions",
      rows: unlinkedTransactionIds.map((id) => ({ id, before: { merchant_id: merchant.id }, after: { merchant_id: null } })),
    });
  }
  return {
    kind: "merchantDeleted",
    params: { name: merchant.name, count: unlinkedTransactionIds.length },
    affectedCount: unlinkedTransactionIds.length,
    refs: { merchants: [merchant.id], ...(unlinkedTransactionIds.length ? { transactions: unlinkedTransactionIds } : {}) },
    undoData: { ops },
  };
}

/**
 * The one-time re-test of the old detector's items (lib/recurring-migration.ts): the
 * ones that failed were switched off, unlinked from their payments and listed for
 * review; the ones that passed and were untouched got their detected rhythm. Undo puts
 * all of it back and drops the review rows. Null when there were no auto items at all.
 */
export function recurringMigratedEntry(input: {
  kept: number;
  failed: { id: number; name: string }[];
  rescheduled: { id: number; before: DbRow; after: DbRow }[];
  unlinked: { id: number; itemId: number }[];
  suggestionIds: number[];
}): ActivityEntryInput | null {
  const { kept, failed, rescheduled, unlinked, suggestionIds } = input;
  if (kept === 0 && failed.length === 0) return null;
  const ops: UndoOp[] = [];
  if (failed.length > 0) {
    ops.push({ op: "update", table: "recurring_items", rows: failed.map((f) => ({ id: f.id, before: { active: 1 }, after: { active: 0 } })) });
  }
  if (rescheduled.length > 0) ops.push({ op: "update", table: "recurring_items", rows: rescheduled });
  if (unlinked.length > 0) {
    ops.push({
      op: "update",
      table: "transactions",
      rows: unlinked.map((u) => ({ id: u.id, before: { recurring_item_id: u.itemId }, after: { recurring_item_id: null } })),
    });
  }
  if (suggestionIds.length > 0) ops.push({ op: "delete", table: "recurring_suggestions", ids: suggestionIds });
  const itemIds = [...new Set([...failed.map((f) => f.id), ...rescheduled.map((r) => r.id)])];
  return {
    kind: "recurringMigrated",
    params: { kept, review: failed.length },
    affectedCount: failed.length + rescheduled.length,
    refs: {
      ...(itemIds.length ? { recurring_items: itemIds } : {}),
      ...(unlinked.length ? { transactions: unlinked.map((u) => u.id) } : {}),
      ...(suggestionIds.length ? { recurring_suggestions: suggestionIds } : {}),
    },
    undoData: ops.length ? { ops, rerunRules: true } : null,
  };
}

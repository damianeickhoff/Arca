import type Database from "better-sqlite3";
import { db } from "@/db";
import {
  bankSyncEntry,
  findUndoConflict,
  importEntry,
  toDbValue,
  transactionFingerprint,
  type ActivityEntryInput,
  type ActivityKind,
  type ActivityParams,
  type ActivityRefs,
  type BankSyncParams,
  type DbRow,
  type DbValue,
  type DeleteSnapshot,
  type UndoData,
  type UndoOp,
} from "@/lib/activity-log-entries";

// The change log's database half (Settings › Data health › Recent changes). Code paths
// that change many rows at once, or delete something, build an entry with the builders
// in activity-log-entries.ts and hand it to recordActivity(); undoActivity() reverses
// one inside a single transaction. Rows are read and written with raw SQL on the
// better-sqlite3 connection, so one engine can snapshot and restore any table.

/** How many entries are kept; older ones are dropped as new ones come in. */
export const ACTIVITY_LOG_LIMIT = 500;

function client(): Database.Database {
  return (db as unknown as { $client: Database.Database }).$client;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
function q(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
}

const CHUNK = 500;
function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

function tableColumns(table: string): string[] {
  return (client().prepare(`PRAGMA table_info(${q(table)})`).all() as { name: string }[]).map((c) => c.name);
}

function selectWhereIn(table: string, column: string, values: DbValue[]): DbRow[] {
  const out: DbRow[] = [];
  for (const part of chunks(values)) {
    out.push(...(client().prepare(`SELECT * FROM ${q(table)} WHERE ${q(column)} IN (${part.map(() => "?").join(",")})`).all(...part) as DbRow[]));
  }
  return out;
}

/** Rows by id, as stored (column names, 0/1 booleans). */
export function selectRowsByIds(table: string, ids: number[]): DbRow[] {
  return ids.length ? selectWhereIn(table, "id", ids) : [];
}

// ─── Recording ────────────────────────────────────────────────────────────────

async function currentUserId(): Promise<number | null> {
  try {
    const { getCurrentUser } = await import("@/lib/auth");
    return (await getCurrentUser())?.id ?? null;
  } catch {
    // Outside a request (tests, scripts): nobody to attribute it to.
    return null;
  }
}

/**
 * Stores one change-log entry (a null entry — nothing changed — is skipped) and drops
 * entries beyond the newest ACTIVITY_LOG_LIMIT. Returns the new entry's id. Never
 * throws: a change that went through must not be reported as failed because its log
 * entry couldn't be written.
 */
export async function recordActivity(entry: ActivityEntryInput | null, userId?: number | null): Promise<number | null> {
  if (!entry) return null;
  const uid = userId !== undefined ? userId : await currentUserId();
  try {
    const c = client();
    const info = c
      .prepare(`INSERT INTO activity_log (user_id, kind, summary, params, affected_count, refs, undo_data) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(uid, entry.kind, entry.kind, JSON.stringify(entry.params), entry.affectedCount, JSON.stringify(entry.refs), entry.undoData ? JSON.stringify(entry.undoData) : null);
    c.prepare(`DELETE FROM activity_log WHERE id NOT IN (SELECT id FROM activity_log ORDER BY id DESC LIMIT ?)`).run(ACTIVITY_LOG_LIMIT);
    return Number(info.lastInsertRowid);
  } catch (e) {
    console.error("[activity-log] could not record", entry.kind, e);
    return null;
  }
}

/**
 * Logs the transactions a CSV import inserted. Reads the rows as they are now, after
 * every pass the import ran, so "touched since" means touched after the import finished.
 */
export async function recordImport(insertedIds: number[], params: { skipped?: number; source?: string | null } = {}) {
  return recordActivity(importEntry(selectRowsByIds("transactions", insertedIds), params));
}

/**
 * Logs one connection's bank sync run (bank-sync.ts records every run, automatic or by
 * hand, failed ones included): the rows it inserted, read as stored after the import,
 * the already-there count, the bank's name and, for a failed run, the error code.
 */
export async function recordBankSync(insertedIds: number[], params: BankSyncParams = {}) {
  return recordActivity(bankSyncEntry(selectRowsByIds("transactions", insertedIds), params));
}

// ─── Delete snapshots ─────────────────────────────────────────────────────────

/** A foreign key pointing at a table: `table.column` references it. */
export interface ReferencingEdge {
  table: string;
  column: string;
  /** The referenced column (null = its primary key, "id"). */
  to?: string | null;
  onDelete: string;
}

function referencingEdges(): Map<string, ReferencingEdge[]> {
  const map = new Map<string, ReferencingEdge[]>();
  const tables = client().prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[];
  for (const { name } of tables) {
    if (!IDENTIFIER.test(name)) continue;
    const fks = client().prepare(`PRAGMA foreign_key_list(${q(name)})`).all() as { table: string; from: string; to: string | null; on_delete: string }[];
    for (const fk of fks) {
      const list = map.get(fk.table) ?? [];
      list.push({ table: name, column: fk.from, to: fk.to, onDelete: fk.on_delete.toUpperCase() });
      map.set(fk.table, list);
    }
  }
  return map;
}

/**
 * Everything deleting `ids` from `table` takes with it, captured before the delete:
 * the rows themselves, every row an ON DELETE CASCADE removes (followed down), and
 * every column an ON DELETE SET NULL clears. `extraEdges` adds relations a caller
 * deletes or clears by hand — older databases may lack the cascading foreign keys,
 * and the snapshot must match what the caller actually removes. Run it inside the
 * same transaction as the delete.
 */
export function snapshotDelete(table: string, ids: number[], extraEdges: ReferencingEdge[] = []): DeleteSnapshot {
  const edgesByTarget = referencingEdges();
  const inserts = new Map<string, Map<number, DbRow>>();
  const updates = new Map<string, Map<number, { id: number; before: DbRow; after: DbRow }>>();
  let complete = true;

  function visit(current: string, idList: number[], extra: ReferencingEdge[]) {
    if (!tableColumns(current).includes("id")) {
      complete = false;
      return;
    }
    const seen = inserts.get(current) ?? new Map<number, DbRow>();
    inserts.set(current, seen);
    const fresh = [...new Set(idList)].filter((id) => !seen.has(id));
    if (fresh.length === 0) return;
    const rows = selectRowsByIds(current, fresh);
    for (const row of rows) seen.set(Number(row.id), row);

    const edges = [...(edgesByTarget.get(current) ?? [])];
    for (const e of extra) if (!edges.some((x) => x.table === e.table && x.column === e.column)) edges.push(e);
    for (const edge of edges) {
      const keys = [...new Set(rows.map((r) => r[edge.to ?? "id"]).filter((v) => v != null))];
      if (keys.length === 0) continue;
      const children = selectWhereIn(edge.table, edge.column, keys);
      if (children.length === 0) continue;
      if (edge.onDelete === "CASCADE") {
        if (!tableColumns(edge.table).includes("id")) {
          complete = false;
          continue;
        }
        visit(edge.table, children.map((r) => Number(r.id)), []);
      } else if (edge.onDelete === "SET NULL") {
        const list = updates.get(edge.table) ?? new Map();
        updates.set(edge.table, list);
        for (const child of children) {
          const id = Number(child.id);
          const entry = list.get(id) ?? { id, before: {}, after: {} };
          entry.before[edge.column] = child[edge.column];
          entry.after[edge.column] = null;
          list.set(id, entry);
        }
      }
    }
  }

  visit(table, ids, extraEdges);

  return {
    inserts: [...inserts].map(([t, rows]) => ({ table: t, rows: [...rows.values()] })).filter((s) => s.rows.length > 0),
    // A row that is itself deleted comes back whole; no column to restore on it.
    updates: [...updates]
      .map(([t, rows]) => ({ table: t, rows: [...rows.values()].filter((r) => !inserts.get(t)?.has(r.id)) }))
      .filter((s) => s.rows.length > 0),
    complete,
  };
}

// ─── Listing ──────────────────────────────────────────────────────────────────

export interface ActivityItem {
  id: number;
  at: string;
  kind: ActivityKind;
  params: ActivityParams;
  affectedCount: number;
  reversible: boolean;
  undoneAt: string | null;
  userName: string | null;
}

function parseJson<T>(text: unknown): T | null {
  if (typeof text !== "string" || !text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** The newest entries first, for Settings › Data health. */
export function listActivity(limit = 100): ActivityItem[] {
  const rows = client()
    .prepare(
      `SELECT a.id, a.at, a.kind, a.params, a.affected_count, a.undo_data IS NOT NULL AS reversible, a.undone_at, u.name AS user_name
       FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.id DESC LIMIT ?`,
    )
    .all(limit) as { id: number; at: string; kind: ActivityKind; params: string | null; affected_count: number; reversible: number; undone_at: string | null; user_name: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    kind: r.kind,
    params: parseJson<ActivityParams>(r.params) ?? {},
    affectedCount: r.affected_count,
    reversible: r.reversible === 1,
    undoneAt: r.undone_at,
    userName: r.user_name,
  }));
}

// ─── Undo ─────────────────────────────────────────────────────────────────────

export type UndoResult =
  | { ok: true; restored: number; kept: number }
  | { ok: false; reason: "notFound" | "notReversible" | "alreadyUndone" | "failed" }
  | { ok: false; reason: "conflict"; conflict: { id: number; kind: string; params: ActivityParams } };

/** Loose equality for stored values: 1 == "1", 0 == false. */
function sameValue(a: DbValue, b: DbValue): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return a === b;
}

/** Ids of transactions something now refers to (a split, a reimbursement link, a paid bill). */
function linkedTransactionIds(ids: number[]): Set<number> {
  const linked = new Set<number>();
  for (const edge of referencingEdges().get("transactions") ?? []) {
    if (edge.table === "transactions") continue;
    for (const row of selectWhereIn(edge.table, edge.column, ids)) linked.add(Number(row[edge.column]));
  }
  return linked;
}

function applyOp(op: UndoOp): { restored: number; kept: number } {
  const c = client();
  let restored = 0;
  let kept = 0;
  switch (op.op) {
    case "delete": {
      for (const part of chunks(op.ids)) {
        restored += c.prepare(`DELETE FROM ${q(op.table)} WHERE id IN (${part.map(() => "?").join(",")})`).run(...part).changes;
      }
      break;
    }
    case "deleteUnchanged": {
      const current = new Map(selectRowsByIds("transactions", op.rows.map((r) => r.id)).map((r) => [Number(r.id), r]));
      const linked = linkedTransactionIds([...current.keys()]);
      const doomed: number[] = [];
      for (const r of op.rows) {
        const row = current.get(r.id);
        if (!row) continue; // already gone
        if (linked.has(r.id) || transactionFingerprint(row) !== r.fp) kept++;
        else doomed.push(r.id);
      }
      for (const part of chunks(doomed)) {
        restored += c.prepare(`DELETE FROM transactions WHERE id IN (${part.map(() => "?").join(",")})`).run(...part).changes;
      }
      break;
    }
    case "update": {
      const columns = new Set(tableColumns(op.table));
      const current = new Map(selectRowsByIds(op.table, op.rows.map((r) => r.id)).map((r) => [Number(r.id), r]));
      for (const r of op.rows) {
        const row = current.get(r.id);
        const cols = Object.keys(r.before).filter((col) => columns.has(col));
        if (!row || cols.length === 0) continue;
        // Changed again since (by hand, or by a change that wasn't logged): leave it.
        if (!cols.every((col) => sameValue(toDbValue(row[col]), toDbValue(r.after[col])))) {
          kept++;
          continue;
        }
        c.prepare(`UPDATE ${q(op.table)} SET ${cols.map((col) => `${q(col)} = ?`).join(", ")} WHERE id = ?`).run(...cols.map((col) => toDbValue(r.before[col])), r.id);
        restored++;
      }
      break;
    }
    case "insert": {
      // Columns dropped since are skipped; columns added since take their default.
      const columns = new Set(tableColumns(op.table));
      for (const row of op.rows) {
        const cols = Object.keys(row).filter((col) => columns.has(col));
        c.prepare(`INSERT INTO ${q(op.table)} (${cols.map(q).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...cols.map((col) => toDbValue(row[col])));
        restored++;
      }
      break;
    }
  }
  return { restored, kept };
}

/**
 * Reverses one entry inside a single transaction and marks it undone. Refused when
 * a later change that is still in effect touched any of the same rows — that one
 * has to be undone first. A restore that can't go through (a name taken again since,
 * say) rolls back as a whole.
 */
export async function undoActivity(id: number): Promise<UndoResult> {
  const c = client();
  let rerunRules = false;
  const run = c.transaction((): UndoResult => {
    const entry = c.prepare(`SELECT id, kind, refs, undo_data, undone_at FROM activity_log WHERE id = ?`).get(id) as
      | { id: number; kind: string; refs: string | null; undo_data: string | null; undone_at: string | null }
      | undefined;
    if (!entry) return { ok: false, reason: "notFound" };
    if (entry.undone_at) return { ok: false, reason: "alreadyUndone" };
    const undo = parseJson<UndoData>(entry.undo_data);
    if (!undo) return { ok: false, reason: "notReversible" };

    const later = (c.prepare(`SELECT id, kind, params, refs, undone_at FROM activity_log WHERE id > ? AND undone_at IS NULL`).all(id) as
      { id: number; kind: string; params: string | null; refs: string | null; undone_at: string | null }[]
    ).map((r) => ({ id: r.id, kind: r.kind, params: r.params, refs: parseJson<ActivityRefs>(r.refs), undoneAt: r.undone_at }));
    const conflict = findUndoConflict({ id: entry.id, kind: entry.kind, refs: parseJson<ActivityRefs>(entry.refs), undoneAt: null }, later);
    if (conflict) {
      return { ok: false, reason: "conflict", conflict: { id: conflict.id, kind: conflict.kind, params: parseJson<ActivityParams>(conflict.params) ?? {} } };
    }

    // Restored rows may point at each other in any order; check the keys at commit.
    c.exec("PRAGMA defer_foreign_keys = ON");
    let restored = 0;
    let kept = 0;
    for (const op of undo.ops) {
      const r = applyOp(op);
      restored += r.restored;
      kept += r.kept;
    }
    c.prepare(`UPDATE activity_log SET undone_at = datetime('now') WHERE id = ?`).run(id);
    rerunRules = !!undo.rerunRules;
    return { ok: true, restored, kept };
  });

  let result: UndoResult;
  try {
    result = run();
  } catch (e) {
    console.error("[activity-log] undo failed", id, e);
    return { ok: false, reason: "failed" };
  }
  if (result.ok && rerunRules) {
    // Restored rules, categories or a dismissed recurring item change what the rule
    // pass decides; let it settle the transactions again (not logged — it's part of
    // the undo).
    const { applyAllRules } = await import("@/lib/apply-rules");
    await applyAllRules();
  }
  return result;
}

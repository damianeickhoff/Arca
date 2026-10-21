import type { Database } from "better-sqlite3";
import { evaluateRecent, type DetectTransaction } from "@/lib/recurring-detect";
import { recurringMigratedEntry } from "@/lib/activity-log-entries";
import { todayStr } from "@/lib/date-range";

// One-time boot migration (smarter recurring detection): every item the old detector
// created (source = 'auto') is re-tested against the new rules on the payments it was
// linked to. Items that pass stay active, and an item nobody has edited yet gets the
// rhythm the new detector reads from them (quarterly, yearly, the real due day). Items
// that fail are switched off and listed once on Upcoming ("12 earlier auto-detected
// bills look like ordinary spending") for Keep all / Review / Remove all. Nothing is
// deleted; the change log records the pass, so it can be undone.
// Runs synchronously at db init (raw sqlite, like the other boot migrations).

const DONE_KEY = "recurring_detection_v2_migrated";

type ItemRow = {
  id: number;
  name: string;
  type: string;
  amount: number | null;
  frequency: string;
  due_day: number | null;
  start_date: string | null;
  match_pattern: string | null;
  match_amount: number | null;
  match_amount_min: number | null;
  match_amount_max: number | null;
  budget_type: string | null;
  signature: string | null;
};

export function migrateAutoRecurringItems(sqlite: Database, today = todayStr()) {
  sqlite.exec("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)");
  const done = sqlite.prepare("SELECT value FROM app_settings WHERE key = ?").get(DONE_KEY);
  if (done) return;

  const items = sqlite
    .prepare(`SELECT * FROM recurring_items WHERE source = 'auto' AND dismissed = 0 AND active = 1`)
    .all() as ItemRow[];
  const linkedTo = sqlite.prepare(`
    SELECT t.id, t.date, t.amount, t.direction, t.description, t.merchant_id AS merchantId,
           m.name AS merchantName, t.counter_account AS counterAccount
    FROM transactions t LEFT JOIN merchants m ON m.id = t.merchant_id
    WHERE t.recurring_item_id = ?
  `);
  const reschedule = sqlite.prepare(`UPDATE recurring_items SET frequency = ?, due_day = ?, start_date = ? WHERE id = ?`);
  const switchOff = sqlite.prepare(`UPDATE recurring_items SET active = 0 WHERE id = ?`);
  const unlink = sqlite.prepare(`UPDATE transactions SET recurring_item_id = NULL WHERE recurring_item_id = ?`);
  const suggest = sqlite.prepare(`
    INSERT INTO recurring_suggestions
      (signature, group_key, status, name, type, frequency, due_day, start_date, amount, match_pattern,
       match_amount, match_amount_min, match_amount_max, budget_type, merchant_id, occurrences, first_date,
       last_date, confidence, transaction_ids, recurring_item_id, was_active)
    VALUES (?, 'legacy', 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1)
  `);

  const run = sqlite.transaction(() => {
    const kept: number[] = [];
    const rescheduled: { id: number; before: Record<string, string | number | null>; after: Record<string, string | number | null> }[] = [];
    const failed: { id: number; name: string }[] = [];
    const unlinked: { id: number; itemId: number }[] = [];
    const suggestionIds: number[] = [];

    for (const item of items) {
      const wanted = item.type === "income" ? "income" : "expense";
      const txns = (linkedTo.all(item.id) as DetectTransaction[]).filter((t) => t.direction === wanted);
      const result = txns.length > 0
        ? evaluateRecent(txns, { today, signature: item.signature ?? `legacy:${item.id}`, hints: [item.match_pattern] })
        : null;

      if (result?.ok) {
        kept.push(item.id);
        // The editor always sets a start date, so an item without one is as the old
        // detector made it: give it the rhythm the payments show.
        if (item.start_date == null) {
          const c = result.candidate;
          reschedule.run(c.frequency, c.dueDay, c.startDate, item.id);
          rescheduled.push({
            id: item.id,
            before: { frequency: item.frequency, due_day: item.due_day, start_date: null },
            after: { frequency: c.frequency, due_day: c.dueDay, start_date: c.startDate },
          });
        }
        continue;
      }

      switchOff.run(item.id);
      for (const t of txns) unlinked.push({ id: t.id, itemId: item.id });
      unlink.run(item.id);
      const dates = txns.map((t) => t.date).sort();
      const info = suggest.run(
        `legacy:${item.id}`, item.name, item.type, item.frequency, item.due_day, item.start_date, item.amount,
        item.match_pattern ?? "", item.match_amount, item.match_amount_min, item.match_amount_max, item.budget_type,
        txns.at(-1)?.merchantId ?? null, txns.length, dates[0] ?? null, dates.at(-1) ?? null,
        JSON.stringify(txns.map((t) => t.id)), item.id,
      );
      suggestionIds.push(Number(info.lastInsertRowid));
      failed.push({ id: item.id, name: item.name });
    }

    const entry = recurringMigratedEntry({ kept: kept.length, failed, rescheduled, unlinked, suggestionIds });
    if (entry) {
      sqlite
        .prepare(`INSERT INTO activity_log (user_id, kind, summary, params, affected_count, refs, undo_data) VALUES (NULL, ?, ?, ?, ?, ?, ?)`)
        .run(entry.kind, entry.kind, JSON.stringify(entry.params), entry.affectedCount, JSON.stringify(entry.refs), entry.undoData ? JSON.stringify(entry.undoData) : null);
    }
    sqlite.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(DONE_KEY, new Date().toISOString());
  });
  run();
}

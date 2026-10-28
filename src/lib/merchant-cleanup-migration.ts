import type { Database } from "better-sqlite3";
import { deriveMerchantName, normalizeMerchantKey } from "@/lib/merchant-name";

// The merchant extractor used to fall back to the words after a leading store code
// when a card description named no brand, so "1451 Lienden Lienden NLD" (Action's
// Lienden store, which the bank sends without the word Action) became a merchant
// called "Lienden Lienden Nld", "1451 Lienden" one called "Lienden", and "2Switch
// Tiel TIEL NLD" one called "Tiel Tiel Nld" (a digit-led brand counted as a code too).
// This one-time pass removes the profiles that only exist because of that: for every
// one of its transactions the old fallback gives its name (from the description or the
// raw one) and the extractor now derives something else. A merchant the user touched (renamed, gave an
// icon, a default category or "Recognised by" patterns) stays. The unlinked
// transactions are linked again by the merchant backfill that runs right after this
// at db init (src/db/index.ts): to a merchant's pattern, a real brand, or nothing.

const DONE_KEY = "merchant_city_names_cleaned";

/** What the old fallback made of a description that starts with a code (skip the
 *  leading codes and labels, take up to three words), or null. */
function oldFallbackKey(description: string | null): string | null {
  const tokens = (description ?? "").trim().split(/\s+/).filter(Boolean);
  const isSkipped = (t: string) => /\d/.test(t) || t.endsWith(":");
  let i = 0;
  let sawCode = false;
  for (; i < tokens.length && isSkipped(tokens[i]); i++) if (/\d/.test(tokens[i])) sawCode = true;
  if (!sawCode) return null;
  const words: string[] = [];
  for (; i < tokens.length && words.length < 3 && /^[a-zA-Z]/.test(tokens[i]) && !isSkipped(tokens[i]); i++) words.push(tokens[i]);
  return normalizeMerchantKey(words.join(" ")) || null;
}

export function cleanUpCityMerchants(sqlite: Database) {
  sqlite.exec("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)");
  const done = sqlite.prepare("SELECT value FROM app_settings WHERE key = ?").get(DONE_KEY);
  if (done) return;

  const candidates = sqlite
    .prepare(`
      SELECT m.id, m.name, m.normalized_key AS key FROM merchants m
      WHERE m.deleted = 0 AND m.icon IS NULL AND m.color IS NULL AND m.default_category_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM merchant_patterns p WHERE p.merchant_id = m.id)
    `)
    .all() as { id: number; name: string; key: string }[];
  const linked = sqlite.prepare(`SELECT description, raw_description FROM transactions WHERE merchant_id = ?`);
  const unlink = sqlite.prepare(`UPDATE transactions SET merchant_id = NULL WHERE merchant_id = ?`);
  const remove = sqlite.prepare(`DELETE FROM merchants WHERE id = ?`);

  const isLeftover = (merchant: { name: string; key: string }, rows: { description: string; raw_description: string | null }[]) =>
    rows.length > 0 &&
    normalizeMerchantKey(merchant.name) === merchant.key &&
    rows.every((r) => {
      if (oldFallbackKey(r.description) !== merchant.key && oldFallbackKey(r.raw_description) !== merchant.key) return false;
      const now = deriveMerchantName({ description: r.description, rawDescription: r.raw_description });
      return !now || normalizeMerchantKey(now) !== merchant.key;
    });

  try {
    sqlite.transaction(() => {
      for (const m of candidates) {
        const rows = linked.all(m.id) as { description: string; raw_description: string | null }[];
        if (!isLeftover(m, rows)) continue;
        unlink.run(m.id);
        remove.run(m.id);
      }
      sqlite.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run(DONE_KEY, new Date().toISOString());
    })();
  } catch (err) {
    console.error("[merchant-cleanup] city-name cleanup failed:", err);
  }
}

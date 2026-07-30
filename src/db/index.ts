import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import { runConfigSync, applyDefaultCategoryRulesSync } from "@/lib/config-sync";
import { deriveMerchantName, normalizeMerchantKey } from "@/lib/merchant-name";
import { detectBrandIcon } from "@/lib/brand-detect";
import { DEFAULT_CATEGORIES, normalizeMatchingPattern } from "@/config/categories";

// NOTE: this runtime auto-migrate block is separate from src/db/migrate.ts (used by
// `npm run db:init` for fresh databases). Any new column MUST be added in BOTH places —
// this file so existing deployed databases pick it up on next boot, migrate.ts so a
// brand-new database is created with the column from the start.
const DB_PATH =
  process.env.DB_PATH || path.join(process.cwd(), "finance.db");

// The connection is opened and migrated lazily on first access — NOT at module import.
// This matters for `next build`: the "Collecting page data" phase evaluates every route
// module (and therefore this one), and if we opened/queried the DB here it would create
// an empty finance.db and crash on the not-yet-migrated `transactions` table. Deferring
// until the first real query keeps the build DB-free and keeps finance.db out of the image.
function initDb(): BetterSQLite3Database<typeof schema> {
  const sqlite = new Database(DB_PATH);

  // Enable WAL mode for better performance
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Adds a column only if it doesn't already exist, by checking the table's actual schema
// instead of firing the ALTER and swallowing the "duplicate column" error — so a real
// failure (e.g. a typo in the column definition) surfaces instead of being silently eaten.
function addColumnIfMissing(table: string, column: string, definition: string) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === column)) return;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// Auto-migrate: brand icon rules table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS brand_icon_rules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name_pattern    TEXT    NOT NULL,
    name_wildcard   INTEGER NOT NULL DEFAULT 1,
    name_whole_word INTEGER NOT NULL DEFAULT 0,
    brand_icon      TEXT    NOT NULL
  )
`);

// Auto-migrate: brandIcon + brandIconColor columns on transactions
addColumnIfMissing("transactions", "brand_icon", "TEXT");
addColumnIfMissing("transactions", "brand_icon_color", "TEXT");

// Auto-migrate: iconColor + iconBgColor on brand_icon_rules
addColumnIfMissing("brand_icon_rules", "icon_color", "TEXT");
addColumnIfMissing("brand_icon_rules", "icon_bg_color", "TEXT");

// Auto-migrate: brandIconBgColor on transactions
addColumnIfMissing("transactions", "brand_icon_bg_color", "TEXT");
addColumnIfMissing("transactions", "expected_reimbursement", "REAL");
addColumnIfMissing("transactions", "corrected_amount", "REAL");
addColumnIfMissing("recurring_items", "match_pattern", "TEXT");

// Auto-migrate: savings month overrides
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS savings_month_overrides (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id         INTEGER NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
    month           TEXT    NOT NULL,
    override_amount REAL    NOT NULL,
    UNIQUE(goal_id, month)
  )
`);

// Auto-migrate: ensure prognose_overrides table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS prognose_overrides (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    recurring_item_id INTEGER NOT NULL REFERENCES recurring_items(id) ON DELETE CASCADE,
    month             TEXT    NOT NULL,
    amount            REAL    NOT NULL,
    UNIQUE(recurring_item_id, month)
  )
`);

// Auto-migrate: financial month overrides
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS financial_month_overrides (
    month      TEXT PRIMARY KEY,
    start_day  INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Auto-migrate: transactions.account column
addColumnIfMissing("transactions", "account", "TEXT");
addColumnIfMissing("transactions", "counter_account", "TEXT");

// Auto-migrate: change categories.name UNIQUE → UNIQUE(name, "group")
{
  const row = sqlite.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='categories'`).get() as { sql: string } | undefined;
  if (row && /name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(row.sql)) {
    sqlite.pragma('foreign_keys = OFF');
    sqlite.exec(`
      CREATE TABLE categories_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        "group"     TEXT    NOT NULL,
        budget_type TEXT,
        color       TEXT,
        icon        TEXT,
        UNIQUE(name, "group")
      );
      INSERT OR IGNORE INTO categories_new (id, name, "group", budget_type, color, icon)
        SELECT id, name, "group", budget_type, color, icon FROM categories;
      DROP TABLE categories;
      ALTER TABLE categories_new RENAME TO categories;
    `);
    sqlite.pragma('foreign_keys = ON');
  }
}

// Auto-migrate: banks table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS banks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    account_number  TEXT    UNIQUE,
    display_name    TEXT,
    card_type       TEXT,
    expiration_date TEXT,
    created_at      TEXT    DEFAULT (datetime('now'))
  )
`);

// Auto-migrate: bankId on category_rules
addColumnIfMissing("category_rules", "bank_id", "INTEGER REFERENCES banks(id) ON DELETE SET NULL");

// Auto-migrate: manual opening balance for an account (display-only, never in reports)
addColumnIfMissing("banks", "starting_balance", "REAL");
addColumnIfMissing("banks", "starting_date", "TEXT");

// Auto-migrate: per-account glyph + accent color (editable in the account edit sheet)
addColumnIfMissing("banks", "icon", "TEXT");
addColumnIfMissing("banks", "color", "TEXT");

// Auto-migrate: internal-transfer sub-type tagging (account kind + per-transaction override)
addColumnIfMissing("banks", "transfer_kind", "TEXT");
addColumnIfMissing("transactions", "transfer_type", "TEXT");

// Auto-migrate: bank-reported balance after the transaction, captured on import.
// Nullable and never backfilled from existing data — rows imported before this column
// existed simply have no reported balance, which every reader must tolerate.
addColumnIfMissing("transactions", "reported_balance", "REAL");

// Backfill: "income" is no longer a budgetType value — a category's `group` already
// marks it as income, so any row still carrying the old inkomen/Income budgetType
// is reset to null (their income-ness is unaffected, only this redundant field).
sqlite.exec(`UPDATE categories SET budget_type = NULL WHERE lower(budget_type) IN ('inkomen', 'income')`);
sqlite.exec(`UPDATE recurring_items SET budget_type = NULL WHERE lower(budget_type) IN ('inkomen', 'income')`);
sqlite.exec(`UPDATE transactions SET budget_type_override = NULL WHERE lower(budget_type_override) IN ('inkomen', 'income')`);

// Auto-migrate: amount-range matching on category_rules
addColumnIfMissing("category_rules", "amount_min", "REAL");
addColumnIfMissing("category_rules", "amount_max", "REAL");

// Auto-migrate: fix transactions.id — must be INTEGER PRIMARY KEY for FKs to work
{
  const row = sqlite.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'`).get() as { sql: string } | undefined;
  if (row && !/INTEGER PRIMARY KEY/i.test(row.sql)) {
    sqlite.pragma('foreign_keys = OFF');
    sqlite.exec(`
      CREATE TABLE transactions_new (
        id                     INTEGER PRIMARY KEY AUTOINCREMENT,
        date                   TEXT    NOT NULL,
        direction              TEXT    NOT NULL,
        type                   TEXT    NOT NULL,
        amount                 REAL    NOT NULL,
        description            TEXT    NOT NULL,
        raw_description        TEXT,
        category_id            INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        source                 TEXT    NOT NULL DEFAULT 'manual',
        import_hash            TEXT    UNIQUE,
        notes                  TEXT,
        created_at             TEXT    DEFAULT (datetime('now')),
        manually_categorized   INTEGER NOT NULL DEFAULT 0,
        brand_icon             TEXT,
        brand_icon_color       TEXT,
        brand_icon_bg_color    TEXT,
        is_reimbursement       INTEGER NOT NULL DEFAULT 0,
        is_manual_transfer     INTEGER NOT NULL DEFAULT 0,
        expected_reimbursement REAL,
        corrected_amount       REAL,
        account                TEXT,
        counter_account        TEXT
      );
      INSERT INTO transactions_new
        SELECT id, date, direction, type, amount, description, raw_description,
               category_id, source, import_hash, notes, created_at,
               manually_categorized, brand_icon, brand_icon_color, brand_icon_bg_color,
               is_reimbursement, is_manual_transfer, expected_reimbursement,
               corrected_amount, account, counter_account
        FROM transactions;
      DROP TABLE transactions;
      ALTER TABLE transactions_new RENAME TO transactions;
      CREATE INDEX IF NOT EXISTS idx_transactions_date      ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_transactions_category  ON transactions(category_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_direction ON transactions(direction);
    `);
    sqlite.pragma('foreign_keys = ON');
  }
}

// Auto-migrate: transaction splits
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS transaction_splits (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    amount         REAL    NOT NULL,
    category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    position       INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    DEFAULT (datetime('now'))
  )
`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_transaction_splits_transaction ON transaction_splits(transaction_id)`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_transaction_splits_category ON transaction_splits(category_id)`);

// Auto-migrate: users + sessions tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    name          TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    DEFAULT (datetime('now'))
  )
`);
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);

// Auto-migrate: avatarUrl on users
addColumnIfMissing("users", "avatar_url", "TEXT");

// Auto-migrate: split profile fields collected during onboarding
addColumnIfMissing("users", "first_name", "TEXT");
addColumnIfMissing("users", "last_name", "TEXT");
addColumnIfMissing("users", "birthday", "TEXT");

// Auto-migrate: TOTP MFA + short-lived login MFA challenges
addColumnIfMissing("users", "totp_secret", "TEXT");
addColumnIfMissing("users", "totp_enabled", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("users", "totp_backup_codes", "TEXT");

// Auto-migrate: per-user dashboard background preset (was a single app-wide setting)
addColumnIfMissing("users", "auth_background", "TEXT");
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS mfa_challenges (
    id           TEXT PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    remember_me  INTEGER NOT NULL DEFAULT 0,
    redirect_to  TEXT,
    attempts     INTEGER NOT NULL DEFAULT 0,
    expires_at   TEXT NOT NULL,
    created_at   TEXT DEFAULT (datetime('now'))
  )
`);

// Auto-migrate: isDefault on categories (seeded defaults, read-only in the UI)
addColumnIfMissing("categories", "is_default", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("categories", "config_key", "TEXT");

// Auto-migrate: head/sub-category hierarchy (max 2 levels)
addColumnIfMissing("categories", "parent_category_id", "INTEGER REFERENCES categories(id) ON DELETE SET NULL");

// Auto-migrate: hide a category from the dashboard's "Spending by category" row
addColumnIfMissing("categories", "exclude_from_spending_row", "INTEGER NOT NULL DEFAULT 0");

// Auto-migrate: per-transaction budget type override
addColumnIfMissing("transactions", "budget_type_override", "TEXT");

// Auto-migrate: receipt photo attachment
addColumnIfMissing("transactions", "receipt_url", "TEXT");

// Auto-migrate: bill payments (manual mark-as-paid overrides)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS bill_payments (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    recurring_item_id INTEGER NOT NULL REFERENCES recurring_items(id) ON DELETE CASCADE,
    month             TEXT    NOT NULL,
    transaction_id    INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    amount            REAL,
    paid_at           TEXT DEFAULT (datetime('now')),
    UNIQUE(recurring_item_id, month)
  )
`);

// Auto-migrate: debts ↔ recurring bills. Replaces the old debt_categories link;
// payoff progress now comes from the linked bills' paid-months history. The old
// debt_categories table is intentionally left in place rather than dropped — an
// automatic DROP on boot would be irreversible on deployed databases.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS debt_recurring (
    debt_id           INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    recurring_item_id INTEGER NOT NULL REFERENCES recurring_items(id) ON DELETE CASCADE,
    PRIMARY KEY (debt_id, recurring_item_id)
  )
`);

// Auto-migrate: debt direction — "owe" (you owe someone) vs "owed" (someone owes you).
addColumnIfMissing("debts", "direction", "TEXT NOT NULL DEFAULT 'owe'");
addColumnIfMissing("debts", "end_month", "TEXT");
addColumnIfMissing("debts", "original_amount", "REAL");

// Auto-migrate: day-precise debt start date (mirrored to/from linked recurring bills).
// Backfill from the existing month-only start_month (first of that month).
addColumnIfMissing("debts", "start_date", "TEXT");
sqlite.exec(`UPDATE debts SET start_date = start_month || '-01' WHERE start_date IS NULL AND start_month IS NOT NULL`);

// Auto-migrate: unified goals (budgeting + savings) for the /goals page
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS goals (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_type            TEXT    NOT NULL,
    name                 TEXT    NOT NULL,
    target_amount        REAL    NOT NULL DEFAULT 0,
    current_amount       REAL    NOT NULL DEFAULT 0,
    monthly_contribution REAL,
    category_id          INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    recurrence           TEXT    NOT NULL DEFAULT 'none',
    start_date           TEXT,
    end_date             TEXT,
    color                TEXT,
    icon                 TEXT,
    active               INTEGER NOT NULL DEFAULT 1,
    created_at           TEXT    DEFAULT (datetime('now'))
  )
`);

// Auto-migrate: link a transaction to a savings goal (contributes/withdraws its amount)
addColumnIfMissing("transactions", "goal_id", "INTEGER REFERENCES goals(id) ON DELETE SET NULL");

// Auto-migrate: recurring item → category auto-assignment + friendly-name override
addColumnIfMissing("recurring_items", "category_id", "INTEGER REFERENCES categories(id) ON DELETE CASCADE");
addColumnIfMissing("recurring_items", "match_amount", "REAL");
addColumnIfMissing("recurring_items", "friendly_name", "TEXT");
addColumnIfMissing("transactions", "recurring_item_id", "INTEGER REFERENCES recurring_items(id) ON DELETE SET NULL");

// Auto-migrate: recurring detection (auto-created items, range-amount matching, soft-dismiss)
addColumnIfMissing("recurring_items", "match_amount_min", "REAL");
addColumnIfMissing("recurring_items", "match_amount_max", "REAL");
addColumnIfMissing("recurring_items", "source", "TEXT NOT NULL DEFAULT 'manual'");
addColumnIfMissing("recurring_items", "signature", "TEXT");
addColumnIfMissing("recurring_items", "dismissed", "INTEGER NOT NULL DEFAULT 0");

// Auto-migrate: recurrence period (start/anchor date + optional end date)
addColumnIfMissing("recurring_items", "start_date", "TEXT");
addColumnIfMissing("recurring_items", "end_date", "TEXT");

  // Auto-migrate: per-account "count towards net worth" toggle
  addColumnIfMissing("banks", "include_in_net_worth", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("vermogen_accounts", "include_in_net_worth", "INTEGER NOT NULL DEFAULT 1");

  // Auto-migrate: per-asset-account glyph (editable in the account edit sheet)
  addColumnIfMissing("vermogen_accounts", "icon", "TEXT");

  // Auto-migrate: saved manual CSV column-mapping profiles for unrecognized bank formats
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS import_profiles (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      label             TEXT    NOT NULL,
      header_signature  TEXT    NOT NULL UNIQUE,
      mapping           TEXT    NOT NULL,
      created_at        TEXT    DEFAULT (datetime('now'))
    )
  `);

  // Auto-migrate: monthly financial-health snapshots (one row per financial month)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS financial_health_snapshots (
      month        TEXT PRIMARY KEY,
      score        REAL NOT NULL,
      net_worth    REAL,
      savings_rate REAL,
      breakdown    TEXT,
      updated_at   TEXT DEFAULT (datetime('now'))
    )
  `);

  // Auto-migrate: overall budget (single active row; amount + period + start day)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS budgets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      amount     REAL    NOT NULL,
      period     TEXT    NOT NULL DEFAULT 'monthly',
      start_day  INTEGER NOT NULL DEFAULT 1,
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    DEFAULT (datetime('now'))
    )
  `);

  // Auto-migrate: merchant profiles + the transaction → merchant link
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS merchants (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      normalized_key TEXT    NOT NULL,
      icon           TEXT,
      color          TEXT,
      created_at     TEXT    DEFAULT (datetime('now'))
    )
  `);
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS merchants_normalized_key_unique ON merchants(normalized_key)`);
  addColumnIfMissing("merchants", "deleted", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("transactions", "merchant_id", "INTEGER REFERENCES merchants(id) ON DELETE SET NULL");
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant_id)`);

  // Backfill: derive a merchant for every transaction that doesn't have one yet.
  // Runs on every boot but only ever looks at merchant_id IS NULL rows, so after the
  // first pass it's a single indexed query returning nothing. Manual transfers are
  // skipped outright; other internal transfers may get a merchant assigned but never
  // surface, since every merchant query filters them out (see merchant-detail.ts).
  {
    const pending = sqlite
      .prepare(`SELECT id, description, raw_description FROM transactions WHERE merchant_id IS NULL AND is_manual_transfer = 0`)
      .all() as Array<{ id: number; description: string; raw_description: string | null }>;

    if (pending.length > 0) {
      const findMerchant = sqlite.prepare(`SELECT id, deleted FROM merchants WHERE normalized_key = ?`);
      const insertMerchant = sqlite.prepare(`INSERT INTO merchants (name, normalized_key, icon, color) VALUES (?, ?, ?, ?)`);
      const linkTransaction = sqlite.prepare(`UPDATE transactions SET merchant_id = ? WHERE id = ?`);
      const idByKey = new Map<string, number>();

      const run = sqlite.transaction(() => {
        for (const row of pending) {
          const name = deriveMerchantName({ description: row.description, rawDescription: row.raw_description });
          if (!name) continue;
          const key = normalizeMerchantKey(name);
          if (!key) continue;

          let merchantId = idByKey.get(key);
          if (merchantId === undefined) {
            const found = findMerchant.get(key) as { id: number; deleted: number } | undefined;
            // A deleted merchant stays deleted — never re-link transactions to it.
            if (found?.deleted) { idByKey.set(key, 0); merchantId = 0; }
            else if (found) merchantId = found.id;
            else {
              const brand = detectBrandIcon(name);
              merchantId = Number(insertMerchant.run(name, key, brand?.iconKey ?? null, brand?.color ?? null).lastInsertRowid);
            }
            idByKey.set(key, merchantId);
          }
          if (merchantId === 0) continue;
          linkTransaction.run(merchantId, row.id);
        }
      });
      run();
    }
  }

  // Backfill: merchants created before brand-icon detection existed (or by an earlier
  // build of the backfill above) have no icon at all, which renders as a blank chip in
  // the merchant editor and picker. Fill in any icon we can match by name; a merchant
  // whose name matches no brand is left null and falls back to its transactions' own
  // icon resolution at render time.
  {
    const iconless = sqlite
      .prepare(`SELECT id, name FROM merchants WHERE icon IS NULL AND deleted = 0`)
      .all() as Array<{ id: number; name: string }>;

    if (iconless.length > 0) {
      const setIcon = sqlite.prepare(`UPDATE merchants SET icon = ?, color = ? WHERE id = ?`);
      const run = sqlite.transaction(() => {
        for (const m of iconless) {
          const brand = detectBrandIcon(m.name);
          if (brand) setIcon.run(brand.iconKey, brand.color, m.id);
        }
      });
      run();
    }
  }

  // Auto-migrate: short config-seeded patterns become whole-word matches. They were
  // seeded as "contains", so a 2–5 character pattern matched inside unrelated words —
  // "MBO" (Education) swallowed every "Jumbo" transaction, "Spa" every "Spar", etc.
  // Only touches rules on config-managed (is_default) categories whose pattern still
  // matches the config verbatim, so a user-edited or user-created rule is left alone.
  {
    const shortDefaults = new Set(
      DEFAULT_CATEGORIES.flatMap((def) => def.matchingPatterns ?? [])
        .map((raw) => normalizeMatchingPattern(raw))
        .filter((p) => p.match === "word")
        .map((p) => p.pattern.trim().toLowerCase()),
    );
    if (shortDefaults.size > 0) {
      const candidates = sqlite
        .prepare(`
          SELECT r.id, r.name_pattern AS namePattern
          FROM category_rules r JOIN categories c ON c.id = r.category_id
          WHERE c.is_default = 1 AND r.name_whole_word = 0 AND r.name_pattern IS NOT NULL
        `)
        .all() as Array<{ id: number; namePattern: string }>;
      const promote = sqlite.prepare(`UPDATE category_rules SET name_whole_word = 1 WHERE id = ?`);
      const run = sqlite.transaction(() => {
        let n = 0;
        for (const rule of candidates) {
          if (shortDefaults.has(rule.namePattern.trim().toLowerCase())) n += promote.run(rule.id).changes;
        }
        return n;
      });
      // Re-apply the default rules to existing transactions, so rows already filed under
      // the wrong category by the old contains-match (every "Jumbo" in Education) are
      // corrected on this boot rather than only on the next import.
      if (run() > 0) applyDefaultCategoryRulesSync(sqlite);
    }
  }

  // Sync src/config/categories.ts + src/config/brandIcons.ts into the database.
  // Runs synchronously as part of db init so it's guaranteed to complete before any
  // query in the app — see src/lib/config-sync.ts for why (layout/page render in
  // parallel in Next, so an awaited-in-layout sync still races the page's own queries
  // and the first render shows stale data).
  runConfigSync(sqlite);

  // Backfill: normalize budget types to their canonical Dutch keys (nodig/willen/sparen).
  // The category seed (src/config/categories.ts) stores English labels ("Needs"/"Wants"/
  // "Savings") and config-sync inserts them verbatim, but every runtime query filters on
  // the Dutch keys — so an un-normalized row silently drops out of the dashboard and
  // analytics (it still shows on Trends, which groups by category regardless). Runs after
  // runConfigSync so freshly-seeded rows are healed on the same boot, and every boot so
  // existing databases self-heal. Idempotent — canonical rows already match and are skipped.
  sqlite.exec(`UPDATE categories        SET budget_type = 'nodig'  WHERE lower(budget_type) IN ('needs','need')`);
  sqlite.exec(`UPDATE categories        SET budget_type = 'willen' WHERE lower(budget_type) IN ('wants','want')`);
  sqlite.exec(`UPDATE categories        SET budget_type = 'sparen' WHERE lower(budget_type) IN ('savings','saving')`);
  sqlite.exec(`UPDATE recurring_items   SET budget_type = 'nodig'  WHERE lower(budget_type) IN ('needs','need')`);
  sqlite.exec(`UPDATE recurring_items   SET budget_type = 'willen' WHERE lower(budget_type) IN ('wants','want')`);
  sqlite.exec(`UPDATE recurring_items   SET budget_type = 'sparen' WHERE lower(budget_type) IN ('savings','saving')`);
  sqlite.exec(`UPDATE transactions      SET budget_type_override = 'nodig'  WHERE lower(budget_type_override) IN ('needs','need')`);
  sqlite.exec(`UPDATE transactions      SET budget_type_override = 'willen' WHERE lower(budget_type_override) IN ('wants','want')`);
  sqlite.exec(`UPDATE transactions      SET budget_type_override = 'sparen' WHERE lower(budget_type_override) IN ('savings','saving')`);

  return drizzle(sqlite, { schema });
}

let _db: BetterSQLite3Database<typeof schema> | null = null;

function getDb(): BetterSQLite3Database<typeof schema> {
  if (!_db) _db = initDb();
  return _db;
}

// Lazy proxy: `import { db }` works exactly as before at every call site, but the real
// connection (and migrations) are only created on the first property access — i.e. the
// first query at runtime, never during the build.
export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };

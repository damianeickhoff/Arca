/**
 * Run this file once to initialise the database.
 * node -r ts-node/register src/db/migrate.ts
 * (or via the npm script: npm run db:init)
 *
 * NOTE: this is separate from the runtime auto-migrate block in src/db/index.ts, which
 * patches existing deployed databases on boot. Any new column MUST be added in BOTH files.
 */
import Database from "better-sqlite3";
import path from "path";
import { DEFAULT_CATEGORIES, normalizeMatchingPattern } from "../config/categories.ts";

const DB_PATH =
  process.env.DB_PATH || path.join(process.cwd(), "finance.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    "group"     TEXT    NOT NULL,
    budget_type TEXT,
    color       TEXT
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date            TEXT    NOT NULL,
    direction       TEXT    NOT NULL,
    type            TEXT    NOT NULL,
    amount          REAL    NOT NULL,
    description     TEXT    NOT NULL,
    raw_description TEXT,
    category_id     INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    source          TEXT    NOT NULL DEFAULT 'manual',
    import_hash     TEXT    UNIQUE,
    account         TEXT,
    counter_account TEXT,
    notes           TEXT,
    created_at      TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recurring_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    type        TEXT    NOT NULL,
    amount      REAL,
    frequency   TEXT    NOT NULL DEFAULT 'monthly',
    due_day     INTEGER,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    budget_type TEXT,
    active      INTEGER NOT NULL DEFAULT 1,
    notes       TEXT
  );

  CREATE TABLE IF NOT EXISTS savings_goals (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    name                 TEXT    NOT NULL,
    target_amount        REAL    NOT NULL,
    current_amount       REAL    NOT NULL DEFAULT 0,
    monthly_contribution REAL,
    start_date           TEXT,
    end_date             TEXT,
    color                TEXT,
    active               INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS budget_targets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    year          INTEGER NOT NULL,
    month         INTEGER NOT NULL,
    category_id   INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    target_amount REAL    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS category_rules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id     INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name_pattern    TEXT,
    name_wildcard   INTEGER NOT NULL DEFAULT 1,
    amount          REAL,
    created_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_date      ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_transactions_category  ON transactions(category_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_direction ON transactions(direction);
  CREATE INDEX IF NOT EXISTS idx_category_rules_cat     ON category_rules(category_id);
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS debts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL,
    direction        TEXT    NOT NULL DEFAULT 'owe',
    starting_balance REAL    NOT NULL,
    minimum_payment  REAL    NOT NULL DEFAULT 0,
    start_month      TEXT    NOT NULL,
    color            TEXT,
    notes            TEXT
  );

  CREATE TABLE IF NOT EXISTS debt_recurring (
    debt_id           INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    recurring_item_id INTEGER NOT NULL REFERENCES recurring_items(id) ON DELETE CASCADE,
    PRIMARY KEY (debt_id, recurring_item_id)
  );
`);

// Add columns if they don't exist yet (safe on existing DBs)
try {
  sqlite.exec(`ALTER TABLE transactions ADD COLUMN manually_categorized INTEGER NOT NULL DEFAULT 0`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE category_rules ADD COLUMN name_whole_word INTEGER NOT NULL DEFAULT 0`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE category_rules ADD COLUMN direction TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE category_rules ADD COLUMN amount_min REAL`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE category_rules ADD COLUMN amount_max REAL`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE debts ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE categories ADD COLUMN icon TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE recurring_items ADD COLUMN icon TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE recurring_items ADD COLUMN icon_color TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE recurring_items ADD COLUMN match_pattern TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE recurring_items ADD COLUMN match_amount REAL`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE transactions ADD COLUMN is_reimbursement INTEGER NOT NULL DEFAULT 0`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE transactions ADD COLUMN exclude_from_reports INTEGER NOT NULL DEFAULT 0`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE transactions ADD COLUMN is_manual_transfer INTEGER NOT NULL DEFAULT 0`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE savings_goals ADD COLUMN icon TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE debts ADD COLUMN icon TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE debts ADD COLUMN end_month TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE debts ADD COLUMN original_amount REAL`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE transactions ADD COLUMN custom_name TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE categories ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE transactions ADD COLUMN budget_type_override TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE transactions ADD COLUMN receipt_url TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE categories ADD COLUMN config_key TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE categories ADD COLUMN parent_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE categories ADD COLUMN exclude_from_spending_row INTEGER NOT NULL DEFAULT 0`);
} catch { /* column already exists */ }

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS reimbursements (
    id                           INTEGER PRIMARY KEY AUTOINCREMENT,
    reimbursement_transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    original_transaction_id      INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    amount                       REAL    NOT NULL,
    created_at                   TEXT    DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reimbursements_orig ON reimbursements(original_transaction_id);
  CREATE INDEX IF NOT EXISTS idx_reimbursements_reimb ON reimbursements(reimbursement_transaction_id);
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS transaction_splits (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    amount         REAL    NOT NULL,
    category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    position       INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_transaction_splits_transaction ON transaction_splits(transaction_id);
  CREATE INDEX IF NOT EXISTS idx_transaction_splits_category ON transaction_splits(category_id);
`);

// Retroactively mark existing Tikkie income transactions as reimbursements
sqlite.exec(`
  UPDATE transactions
  SET is_reimbursement = 1
  WHERE direction = 'income'
    AND (LOWER(description) LIKE '%tikkie%' OR LOWER(raw_description) LIKE '%tikkie%')
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS budgets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    amount     REAL    NOT NULL,
    period     TEXT    NOT NULL DEFAULT 'monthly',
    start_day  INTEGER NOT NULL DEFAULT 1,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    DEFAULT (datetime('now'))
  );
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS financial_month_overrides (
    month      TEXT PRIMARY KEY,
    start_day  INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Seed categories ──────────────────────────────────────────────────────
// Sourced from src/config/categories.ts, flagged is_default so the UI treats
// them as read-only, keyed by config_key so src/lib/config-sync.ts can keep
// them in sync (renames, matching-pattern edits, removals) on every later boot —
// this block only needs to get a brand-new database off the ground.
const insertCategory = sqlite.prepare(`
  INSERT OR IGNORE INTO categories (name, "group", budget_type, color, icon, is_default, config_key)
  VALUES (@name, '', @budgetType, @color, @icon, 1, @key)
`);

// Seed the default categories, plus their matchingPatterns as real category_rules
// rows (same shape a user-created rule would have) — this only runs once, for a
// brand-new database, so later edits to matchingPatterns don't retroactively touch
// already-seeded rules (that's config-sync.ts's job on subsequent boots).
const insertRule = sqlite.prepare(`
  INSERT INTO category_rules (category_id, name_pattern, name_wildcard, name_whole_word, direction)
  VALUES (?, ?, ?, ?, ?)
`);
const seedMany = sqlite.transaction((rows: typeof DEFAULT_CATEGORIES) => {
  for (const row of rows) {
    const res = insertCategory.run(row);
    if (res.changes === 0 || !row.matchingPatterns?.length) continue;
    const categoryId = Number(res.lastInsertRowid);
    for (const raw of row.matchingPatterns) {
      const { pattern, match, direction } = normalizeMatchingPattern(raw);
      insertRule.run(categoryId, pattern, match !== "exact" ? 1 : 0, match === "word" ? 1 : 0, direction);
    }
  }
});

// Only seed when the database is brand new (no categories at all).
const catCount = (sqlite.prepare(`SELECT COUNT(*) as c FROM categories`).get() as { c: number }).c;
if (catCount === 0) seedMany(DEFAULT_CATEGORIES);

// Backfill is_default on pre-existing databases that already had these categories
// seeded before is_default existed, so they retroactively become read-only too.
const markDefault = sqlite.prepare(`
  UPDATE categories SET is_default = 1 WHERE name = @name AND is_default = 0
`);
for (const row of DEFAULT_CATEGORIES) markDefault.run(row);

// Link sub-categories to their parents (parentKey -> parent_category_id). config-sync
// only sets parents for rows IT freshly creates, so when db:init seeds the categories
// first (as it does in the Docker entrypoint) the parent links would otherwise never be
// made and every category would render as a top-level one. Nesting is capped at 2 levels,
// matching config-sync: a parentKey pointing at an entry that itself has a parent is skipped.
const idByKey = new Map<string, number>();
for (const r of sqlite.prepare(`SELECT id, config_key FROM categories WHERE config_key IS NOT NULL`).all() as { id: number; config_key: string }[]) {
  idByKey.set(r.config_key, r.id);
}
const setParent = sqlite.prepare(`UPDATE categories SET parent_category_id = ? WHERE id = ?`);
for (const def of DEFAULT_CATEGORIES) {
  if (!def.parentKey) continue;
  const parent = DEFAULT_CATEGORIES.find((d) => d.key === def.parentKey);
  if (!parent || parent.parentKey) continue;
  const childId = idByKey.get(def.key);
  const parentId = idByKey.get(def.parentKey);
  if (childId && parentId) setParent.run(parentId, childId);
}

// ─── Recurring items ─────────────────────────────────────────────────────
// New users start with no recurring bills/subscriptions/debts — these are added
// through the UI/onboarding, not seeded here.

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS variable_prognose_overrides (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id     INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    month           TEXT    NOT NULL,
    override_amount REAL    NOT NULL
  );
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS vermogen_accounts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    type         TEXT    NOT NULL,
    value        REAL    NOT NULL DEFAULT 0,
    color        TEXT,
    notes        TEXT,
    last_updated TEXT,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT    DEFAULT (datetime('now'))
  );
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS net_worth_snapshots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT    NOT NULL UNIQUE,
    net_worth    REAL    NOT NULL,
    total_assets REAL    NOT NULL,
    total_debt   REAL    NOT NULL,
    created_at   TEXT    DEFAULT (datetime('now'))
  );
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    name          TEXT    NOT NULL,
    first_name    TEXT,
    last_name     TEXT,
    birthday      TEXT,
    password_hash TEXT    NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    avatar_url    TEXT,
    created_at    TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

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
  );
`);

try {
  sqlite.exec(`ALTER TABLE transactions ADD COLUMN goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE recurring_items ADD COLUMN friendly_name TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE transactions ADD COLUMN recurring_item_id INTEGER REFERENCES recurring_items(id) ON DELETE SET NULL`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE recurring_items ADD COLUMN match_amount_min REAL`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE recurring_items ADD COLUMN match_amount_max REAL`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE recurring_items ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE recurring_items ADD COLUMN signature TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE recurring_items ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE recurring_items ADD COLUMN start_date TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE recurring_items ADD COLUMN end_date TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE users ADD COLUMN first_name TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE users ADD COLUMN last_name TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE users ADD COLUMN birthday TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE users ADD COLUMN totp_secret TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE users ADD COLUMN totp_backup_codes TEXT`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE users ADD COLUMN auth_background TEXT`);
} catch { /* column already exists */ }
try {
  // DEFAULT 1: existing rows (users who onboarded before this column existed) are
  // already fully onboarded — only a brand-new /api/onboarding signup explicitly
  // inserts 0, and only the wizard's "Finish" step flips it back to 1.
  sqlite.exec(`ALTER TABLE users ADD COLUMN onboarding_complete INTEGER NOT NULL DEFAULT 1`);
} catch { /* column already exists */ }

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS mfa_challenges (
    id           TEXT PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    remember_me  INTEGER NOT NULL DEFAULT 0,
    redirect_to  TEXT,
    attempts     INTEGER NOT NULL DEFAULT 0,
    expires_at   TEXT NOT NULL,
    created_at   TEXT DEFAULT (datetime('now'))
  );
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS bill_payments (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    recurring_item_id INTEGER NOT NULL REFERENCES recurring_items(id) ON DELETE CASCADE,
    month             TEXT    NOT NULL,
    transaction_id    INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    amount            REAL,
    paid_at           TEXT DEFAULT (datetime('now')),
    UNIQUE(recurring_item_id, month)
  );
`);

try {
  sqlite.exec(`ALTER TABLE banks ADD COLUMN include_in_net_worth INTEGER NOT NULL DEFAULT 0`);
} catch { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE vermogen_accounts ADD COLUMN include_in_net_worth INTEGER NOT NULL DEFAULT 1`);
} catch { /* column already exists */ }

console.log("✅ Database initialised and seeded.");
sqlite.close();

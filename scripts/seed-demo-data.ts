/**
 * Fills the database with a coherent set of fake data for development and demos:
 * bank accounts, ~14 months of transaction history, recurring bills/subscriptions/
 * income, debts (with the recurring bills that pay them off), savings goals, an
 * overall budget with per-category targets, and manual asset accounts for net worth.
 *
 *   node --experimental-strip-types scripts/seed-demo-data.ts          # insert
 *   node --experimental-strip-types scripts/seed-demo-data.ts --reset  # remove again
 *
 * Everything it inserts is registered in a `demo_seed` bookkeeping table, so --reset
 * removes exactly the demo rows and nothing the user created by hand. Run --reset
 * before re-seeding; a plain second run would duplicate everything.
 *
 * Deliberately talks to SQLite directly instead of going through src/db (whose Drizzle
 * layer pulls in the whole Next path-alias graph). It therefore does NOT create tables:
 * boot the app (or `npm run db:init`) once first so the schema and the default
 * categories exist.
 *
 * The numbers are random but the shape is not: the same seed produces the same data,
 * income exceeds outgoings by a plausible margin, and the fixed costs each have a
 * matching recurring item so bill-status, the forecast and the debt payoff maths all
 * line up instead of contradicting each other.
 */
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "finance.db");
const RESET = process.argv.includes("--reset");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// ── Bookkeeping ──────────────────────────────────────────────────────────────

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS demo_seed (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT NOT NULL,          -- 'insert' | 'category_group'
    table_name TEXT NOT NULL,
    row_id     TEXT,
    payload    TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

const recordInsert = sqlite.prepare(`INSERT INTO demo_seed (kind, table_name, row_id) VALUES ('insert', ?, ?)`);
const recordPayload = sqlite.prepare(`INSERT INTO demo_seed (kind, table_name, row_id, payload) VALUES (?, ?, ?, ?)`);

/** Runs an INSERT and remembers the new row so --reset can undo it. */
function insert(table: string, values: Record<string, unknown>): number {
  const keys = Object.keys(values);
  const columns = keys.map((k) => `"${k}"`).join(", ");
  const placeholders = keys.map(() => "?").join(", ");
  const info = sqlite
    .prepare(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`)
    .run(keys.map((k) => values[k] as never));
  const id = Number(info.lastInsertRowid);
  recordInsert.run(table, String(id));
  return id;
}

if (RESET) {
  const rows = sqlite
    .prepare(`SELECT id, kind, table_name, row_id, payload FROM demo_seed ORDER BY id DESC`)
    .all() as Array<{ id: number; kind: string; table_name: string; row_id: string | null; payload: string | null }>;

  if (rows.length === 0) {
    console.log("Nothing to reset — no demo rows registered.");
    process.exit(0);
  }

  // FKs off for the duration: the rows are deleted newest-first, which is already
  // dependency-safe, but debt_recurring/bill_payments make that ordering fragile.
  sqlite.pragma("foreign_keys = OFF");
  const undo = sqlite.transaction(() => {
    let deleted = 0;
    for (const row of rows) {
      if (row.kind === "insert" && row.row_id) {
        deleted += sqlite.prepare(`DELETE FROM ${row.table_name} WHERE rowid = ?`).run(Number(row.row_id)).changes;
      } else if (row.kind === "debt_recurring" && row.payload) {
        // No id column of its own — the pair is the key.
        const link = JSON.parse(row.payload) as { debtId: number; recurringId: number };
        deleted += sqlite
          .prepare(`DELETE FROM debt_recurring WHERE debt_id = ? AND recurring_item_id = ?`)
          .run(link.debtId, link.recurringId).changes;
      } else if (row.kind === "category_group" && row.payload) {
        const prev = JSON.parse(row.payload) as { id: number; group: string; budgetType: string | null };
        sqlite.prepare(`UPDATE categories SET "group" = ?, budget_type = ? WHERE id = ?`)
          .run(prev.group, prev.budgetType, prev.id);
      }
    }
    sqlite.exec(`DELETE FROM demo_seed`);
    return deleted;
  });
  const deleted = undo();
  sqlite.pragma("foreign_keys = ON");
  console.log(`Reset done — ${deleted} demo rows removed, category groups restored.`);
  process.exit(0);
}

{
  const existing = sqlite.prepare(`SELECT COUNT(*) AS c FROM demo_seed`).get() as { c: number };
  if (existing.c > 0) {
    console.error("Demo data is already seeded. Run with --reset first if you want to re-seed.");
    process.exit(1);
  }
}

// ── Dates ────────────────────────────────────────────────────────────────────

const HISTORY_MONTHS = 14; // completed + current months of history to generate

const now = new Date();
const TODAY = isoOf(now);

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
/** ISO date for `day` in the month `offset` months from the current one, day clamped. */
function iso(offset: number, day: number): string {
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = base.getFullYear();
  const month = base.getMonth() + 1;
  return `${year}-${pad(month)}-${pad(Math.min(day, daysInMonth(year, month)))}`;
}
function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoOf(d);
}

/** Month offsets covered by the generated history: oldest first, ending this month. */
const historyOffsets: number[] = [];
for (let offset = -(HISTORY_MONTHS - 1); offset <= 0; offset++) historyOffsets.push(offset);

const HISTORY_START = iso(-(HISTORY_MONTHS - 1), 1);

// ── Deterministic randomness ─────────────────────────────────────────────────
// Same seed → same database, so a screenshot taken today is reproducible tomorrow.

let seed = 0x9e3779b9;
function random(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function between(min: number, max: number): number {
  return Math.round((min + random() * (max - min)) * 100) / 100;
}
function intBetween(min: number, max: number): number {
  return Math.floor(min + random() * (max - min + 1));
}
function pick<T>(list: readonly T[]): T {
  return list[Math.floor(random() * list.length)];
}

// ── Categories ───────────────────────────────────────────────────────────────

const categoryIdByName = new Map<string, number>(
  (sqlite.prepare(`SELECT id, name FROM categories ORDER BY id`).all() as Array<{ id: number; name: string }>)
    .map((c) => [c.name, c.id] as const)
    .reverse(), // keep the lowest id when a name appears twice
);

function cat(name: string): number {
  const id = categoryIdByName.get(name);
  if (id === undefined) throw new Error(`Category "${name}" not found — boot the app once so the defaults are seeded.`);
  return id;
}

// The seeded default categories carry a budgetType but no `group`, and several parts of
// the app key off `group`: income transactions only reach the income totals when their
// category is grouped "income", and money moved into a "savings"-grouped category is
// counted as saving rather than spending (see financial-health-data.ts, income-summary,
// month-comparison). Without this the demo data would report a 0% savings rate and an
// income of zero. Previous values are recorded so --reset puts them back.
{
  const INCOME_CATEGORIES = ["Income", "Salary", "Other Income", "Benefits", "Refunds", "Reimbursement"];
  const SAVINGS_CATEGORIES = ["Savings"];
  const read = sqlite.prepare(`SELECT id, "group" AS grp, budget_type AS budgetType FROM categories WHERE id = ?`);
  const write = sqlite.prepare(`UPDATE categories SET "group" = ?, budget_type = ? WHERE id = ?`);

  const regroup = (names: string[], group: string, budgetType: string | null) => {
    for (const name of names) {
      const id = cat(name);
      const prev = read.get(id) as { id: number; grp: string; budgetType: string | null };
      if (prev.grp === group && prev.budgetType === budgetType) continue;
      recordPayload.run("category_group", "categories", String(id),
        JSON.stringify({ id, group: prev.grp, budgetType: prev.budgetType }));
      write.run(group, budgetType, id);
    }
  };

  regroup(INCOME_CATEGORIES, "income", null);
  regroup(SAVINGS_CATEGORIES, "savings", "sparen");
}

// ── Bank accounts ────────────────────────────────────────────────────────────
// The display names must not appear inside any transaction description: a CSV-sourced
// transaction whose description contains a bank's display name is treated as an
// internal transfer (see isInternalTransferExpr). "Savings Pot" is the one exception —
// its transfer legs are meant to be internal.

const MAIN_ACCOUNT = "NL21DEMO0100000001";
const SAVINGS_ACCOUNT = "NL21DEMO0200000002";
const CARD_ACCOUNT = "NL21DEMO0300000003";

// startingDate is the day the opening balances were recorded; transactions on or before
// it are excluded from the derived balance, so it sits one day before the history.
const OPENING_DATE = shift(HISTORY_START, -1);

insert("banks", {
  account_number: MAIN_ACCOUNT,
  display_name: "Everyday Current",
  icon: "IconCreditCard",
  color: "#3b82f6",
  card_type: "debitcard",
  starting_balance: 2400,
  starting_date: OPENING_DATE,
  include_in_net_worth: 1,
});
insert("banks", {
  account_number: SAVINGS_ACCOUNT,
  display_name: "Savings Pot",
  icon: "IconPigMoney",
  color: "#14b8a6",
  card_type: "savings",
  transfer_kind: "savings",
  starting_balance: 4200,
  starting_date: OPENING_DATE,
  include_in_net_worth: 1,
});
insert("banks", {
  account_number: CARD_ACCOUNT,
  display_name: "Plastic Card",
  icon: "IconCreditCardFilled",
  color: "#a855f7",
  card_type: "creditcard",
  transfer_kind: "credit_card_payment",
  expiration_date: iso(28, 28),
  starting_balance: -340,
  starting_date: OPENING_DATE,
  include_in_net_worth: 1,
});

// ── Transactions ─────────────────────────────────────────────────────────────

interface TxInput {
  date: string;
  direction: "income" | "expense";
  type: string; // variabel | rekening | sparen | abonnement | schuld | inkomen
  amount: number;
  description: string;
  categoryName?: string | null;
  account?: string;
  counterAccount?: string | null;
  source?: "manual" | "csv_import";
  isManualTransfer?: boolean;
  isReimbursement?: boolean;
  notes?: string | null;
}

let txCounter = 0;

/** Card spend per YYYY-MM, so the monthly card settlement can clear exactly it. */
const cardSpendByMonth = new Map<string, number>();

function addTransaction(tx: TxInput): number {
  txCounter += 1;
  if ((tx.account ?? MAIN_ACCOUNT) === CARD_ACCOUNT && tx.direction === "expense") {
    const month = tx.date.slice(0, 7);
    cardSpendByMonth.set(month, Math.round(((cardSpendByMonth.get(month) ?? 0) + tx.amount) * 100) / 100);
  }
  return insert("transactions", {
    date: tx.date,
    direction: tx.direction,
    type: tx.type,
    amount: tx.amount,
    description: tx.description,
    raw_description: tx.description,
    category_id: tx.categoryName ? cat(tx.categoryName) : null,
    manually_categorized: 1, // keep the auto-rules from re-filing the demo rows
    source: tx.source ?? "manual",
    // Unique per row, and namespaced so it can never collide with a real import hash.
    import_hash: `demo:${String(txCounter).padStart(5, "0")}`,
    account: tx.account ?? MAIN_ACCOUNT,
    counter_account: tx.counterAccount ?? null,
    is_manual_transfer: tx.isManualTransfer ? 1 : 0,
    is_reimbursement: tx.isReimbursement ? 1 : 0,
    notes: tx.notes ?? null,
  });
}

// ── Fixed monthly costs ──────────────────────────────────────────────────────
// Each of these gets a matching recurring item further down, so the Bills view, the
// forecast and the "paid this month" status all agree.

interface FixedCost {
  name: string;
  amount: number;
  dueDay: number;
  categoryName: string;
  /** transactions.type for the booked rows. */
  txType: string;
  /** recurring_items.type. */
  recurringType: "bill" | "subscription" | "debt";
  budgetType: "nodig" | "willen";
  account?: string;
  /** Skip this month's payment, so the bill shows up unpaid/overdue on the dashboard. */
  unpaidThisMonth?: boolean;
}

const FIXED_COSTS: FixedCost[] = [
  { name: "Rent Housing Corp",        amount: 1150,  dueDay: 1,  categoryName: "Housing",          txType: "rekening",   recurringType: "bill",         budgetType: "nodig" },
  { name: "Health Insurance Zilver",  amount: 138.5, dueDay: 1,  categoryName: "Health Insurance", txType: "rekening",   recurringType: "bill",         budgetType: "nodig" },
  { name: "Gym Membership Fit4Less",  amount: 29.95, dueDay: 2,  categoryName: "Sport",            txType: "abonnement", recurringType: "subscription", budgetType: "willen" },
  { name: "Energy Direct NV",         amount: 142,   dueDay: 3,  categoryName: "Utilities",        txType: "rekening",   recurringType: "bill",         budgetType: "nodig" },
  { name: "Fiber Internet Basic",     amount: 49,    dueDay: 5,  categoryName: "Internet",         txType: "rekening",   recurringType: "bill",         budgetType: "nodig" },
  { name: "Mobile Plan Unlimited",    amount: 28,    dueDay: 5,  categoryName: "Phone",            txType: "rekening",   recurringType: "bill",         budgetType: "nodig", unpaidThisMonth: true },
  { name: "Spotify",                  amount: 11.99, dueDay: 8,  categoryName: "Streaming Services", txType: "abonnement", recurringType: "subscription", budgetType: "willen" },
  { name: "Netflix",                  amount: 13.99, dueDay: 12, categoryName: "Streaming Services", txType: "abonnement", recurringType: "subscription", budgetType: "willen" },
  { name: "iCloud Storage",           amount: 2.99,  dueDay: 14, categoryName: "Apps & Software",  txType: "abonnement", recurringType: "subscription", budgetType: "willen" },
  { name: "NS Season Ticket",         amount: 98,    dueDay: 15, categoryName: "Public Transportation", txType: "rekening", recurringType: "bill",       budgetType: "nodig" },
  { name: "Personal Loan Repayment",  amount: 125,   dueDay: 20, categoryName: "Loans",            txType: "schuld",     recurringType: "debt",         budgetType: "nodig" },
  { name: "Student Loan Repayment",   amount: 185,   dueDay: 27, categoryName: "Loans",            txType: "schuld",     recurringType: "debt",         budgetType: "nodig" },
  { name: "Water Company Vitens",     amount: 23.5,  dueDay: 28, categoryName: "Utilities",        txType: "rekening",   recurringType: "bill",         budgetType: "nodig" },
  { name: "Municipal Taxes Gemeente", amount: 64,    dueDay: 31, categoryName: "Housing",          txType: "rekening",   recurringType: "bill",         budgetType: "nodig" },
];

for (const offset of historyOffsets) {
  for (const cost of FIXED_COSTS) {
    const date = iso(offset, cost.dueDay);
    if (date > TODAY) continue; // future occurrences are the forecast's job, not history
    // The dashboard's Upcoming tile only renders when at least one of this month's bills
    // is still unpaid, so at least one is deliberately left open. Bills due later in the
    // month take care of themselves (their transaction simply isn't generated yet), but
    // late in the month there would otherwise be nothing left to show.
    if (offset === 0 && cost.unpaidThisMonth) continue;
    addTransaction({
      date,
      direction: "expense",
      type: cost.txType,
      amount: cost.amount,
      description: cost.name,
      categoryName: cost.categoryName,
      account: cost.account,
    });
  }
}

// ── Income ───────────────────────────────────────────────────────────────────

const SALARY_DAY = 25;
const SALARY_BASE = 3450;

for (const offset of historyOffsets) {
  const date = iso(offset, SALARY_DAY);
  if (date > TODAY) continue;
  addTransaction({
    date,
    direction: "income",
    type: "inkomen",
    amount: Math.round((SALARY_BASE + between(-70, 90)) * 100) / 100,
    description: "Salary Northwind Studios BV",
    categoryName: "Salary",
  });

  // Dutch holiday allowance lands in May, and it's the single biggest thing that makes
  // the income series look real rather than a flat line.
  const month = Number(date.slice(5, 7));
  if (month === 5) {
    addTransaction({
      date: iso(offset, 24),
      direction: "income",
      type: "inkomen",
      amount: 1740,
      description: "Holiday Allowance Northwind Studios BV",
      categoryName: "Salary",
    });
  }
}

// A tax refund and a couple of side-project invoices, so "Other Income" isn't empty.
addTransaction({ date: iso(-9, 17), direction: "income", type: "inkomen", amount: 612.4, description: "Tax Refund Belastingdienst", categoryName: "Refunds" });
addTransaction({ date: iso(-6, 8),  direction: "income", type: "inkomen", amount: 340,   description: "Freelance Invoice 2024-014", categoryName: "Other Income" });
addTransaction({ date: iso(-2, 11), direction: "income", type: "inkomen", amount: 275,   description: "Freelance Invoice 2024-021", categoryName: "Other Income" });

// Tikkies received — money back on a shared bill, explicitly not income.
for (const offset of [-11, -8, -5, -3, -1]) {
  addTransaction({
    date: iso(offset, intBetween(6, 24)),
    direction: "income",
    type: "inkomen",
    amount: between(11, 48),
    description: "Tikkie received - shared dinner",
    categoryName: "Reimbursement",
    isReimbursement: true,
  });
}

// ── Savings transfers ────────────────────────────────────────────────────────
// Both legs are inserted so each account's derived balance is right; they're
// CSV-sourced with a matching counter account, which is what makes the pair register
// as an internal transfer and drop out of income/expense totals.

const MONTHLY_SAVINGS = 300;

for (const offset of historyOffsets) {
  const date = iso(offset, 26);
  if (date > TODAY) continue;
  const extra = offset % 4 === 0 ? 150 : 0; // an occasional top-up
  const amount = MONTHLY_SAVINGS + extra;

  addTransaction({
    date, direction: "expense", type: "sparen", amount,
    description: "Transfer to Savings Pot", categoryName: "Savings",
    account: MAIN_ACCOUNT, counterAccount: SAVINGS_ACCOUNT, source: "csv_import",
  });
  addTransaction({
    date, direction: "income", type: "sparen", amount,
    description: "Transfer from Everyday Current", categoryName: "Savings",
    account: SAVINGS_ACCOUNT, counterAccount: MAIN_ACCOUNT, source: "csv_import",
  });
}

// ── Variable spending ────────────────────────────────────────────────────────

interface SpendPattern {
  merchants: readonly string[];
  categoryName: string;
  min: number;
  max: number;
  /** Times per month, inclusive range. */
  perMonth: readonly [number, number];
  account?: string;
}

const SPEND_PATTERNS: SpendPattern[] = [
  { merchants: ["Albert Heijn", "Jumbo", "Lidl", "Dirk van den Broek", "Plus Supermarkt"], categoryName: "Groceries",             min: 9,   max: 84, perMonth: [8, 12] },
  { merchants: ["Cafe Central", "De Vier Pijlers", "Sushi Time", "Pizzeria Napoli", "Bar Botanique"], categoryName: "Restaurants & Bars", min: 14,  max: 72, perMonth: [2, 5] },
  { merchants: ["Thuisbezorgd", "Uber Eats"],                                            categoryName: "Food Delivery",         min: 17,  max: 38, perMonth: [1, 3] },
  { merchants: ["Shell", "BP", "Esso"],                                                  categoryName: "Fuel",                  min: 52,  max: 84, perMonth: [1, 3] },
  { merchants: ["Q-Park", "Interparking", "Parkeerbedrijf Centrum"],                     categoryName: "Parking",               min: 2.5, max: 11, perMonth: [0, 3] },
  { merchants: ["Bol.com", "Action", "HEMA"],                                            categoryName: "General Shopping",      min: 8,   max: 64, perMonth: [1, 3], account: CARD_ACCOUNT },
  { merchants: ["Zara", "H&M", "Sneaker District"],                                      categoryName: "Clothing",              min: 22,  max: 119, perMonth: [0, 2], account: CARD_ACCOUNT },
  { merchants: ["Coolblue", "MediaMarkt"],                                               categoryName: "Electronics",           min: 24,  max: 189, perMonth: [0, 1], account: CARD_ACCOUNT },
  { merchants: ["IKEA", "Praxis", "Xenos"],                                              categoryName: "Home Goods",            min: 12,  max: 96, perMonth: [0, 1] },
  { merchants: ["Etos", "Kruidvat"],                                                     categoryName: "Cosmetics",             min: 4,   max: 27, perMonth: [0, 2] },
  { merchants: ["Apotheek Centrum"],                                                     categoryName: "Medication",            min: 7,   max: 26, perMonth: [0, 1] },
  { merchants: ["Pathe Cinema"],                                                          categoryName: "Cinema",                min: 11,  max: 27, perMonth: [0, 1] },
  { merchants: ["Ticketmaster", "Paradiso"],                                             categoryName: "Events",                min: 24,  max: 78, perMonth: [0, 1] },
  { merchants: ["NS Reizigers", "GVB"],                                                  categoryName: "Public Transportation", min: 3,   max: 24, perMonth: [0, 2] },
  { merchants: ["Adobe", "JetBrains"],                                                   categoryName: "Apps & Software",       min: 11,  max: 25, perMonth: [0, 1] },
  { merchants: ["Bloemenhuis Roos", "Gift Shop De Kado"],                                categoryName: "Gifts",                 min: 12,  max: 58, perMonth: [0, 1] },
  { merchants: ["Muziekhandel Klank", "Boekhandel Verhaal"],                             categoryName: "Hobbies",               min: 9,   max: 62, perMonth: [0, 1] },
];

for (const offset of historyOffsets) {
  for (const pattern of SPEND_PATTERNS) {
    const count = intBetween(pattern.perMonth[0], pattern.perMonth[1]);
    for (let i = 0; i < count; i++) {
      const date = iso(offset, intBetween(1, 28));
      if (date > TODAY) continue;
      addTransaction({
        date,
        direction: "expense",
        type: "variabel",
        amount: between(pattern.min, pattern.max),
        description: pick(pattern.merchants),
        categoryName: pattern.categoryName,
        account: pattern.account,
      });
    }
  }
}

// A couple of one-off larger expenses, so Trends has visible spikes.
addTransaction({ date: iso(-10, 19), direction: "expense", type: "variabel", amount: 742,   description: "Car maintenance Garage Bakker", categoryName: "Car maintenance" });
addTransaction({ date: iso(-7, 6),   direction: "expense", type: "variabel", amount: 1289,  description: "Transavia flight booking",       categoryName: "Flights" });
addTransaction({ date: iso(-7, 9),   direction: "expense", type: "variabel", amount: 615.5, description: "Booking.com accommodation",      categoryName: "Accommodation", account: CARD_ACCOUNT });
addTransaction({ date: iso(-4, 22),  direction: "expense", type: "variabel", amount: 268,   description: "Dental Clinic Smile",            categoryName: "Dental Care" });

// ── Already-booked future transactions ───────────────────────────────────────
// Dated ahead of today, so the forecast has real bookings alongside its projections.

addTransaction({ date: shift(TODAY, 9),  direction: "expense", type: "variabel", amount: 186,   description: "Transavia flight booking",  categoryName: "Flights" });
addTransaction({ date: shift(TODAY, 21), direction: "expense", type: "variabel", amount: 94.5,  description: "Dental Clinic Smile",       categoryName: "Dental Care" });
addTransaction({ date: shift(TODAY, 34), direction: "expense", type: "variabel", amount: 78,    description: "Ticketmaster",              categoryName: "Events", account: CARD_ACCOUNT });
addTransaction({ date: shift(TODAY, 48), direction: "income",  type: "inkomen",  amount: 310,   description: "Freelance Invoice 2024-026", categoryName: "Other Income" });

// ── Credit card settlement ───────────────────────────────────────────────────
// The card is paid off in full on the 5th of the following month, otherwise its balance
// would just spiral down across the whole history. Both legs again, and internal, so it
// never registers as income or spending.

for (const [month, spend] of [...cardSpendByMonth.entries()].sort()) {
  if (spend <= 0) continue;
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(year, monthNumber, 5); // month is 1-based, so this is the 5th of the next month
  const date = isoOf(next);
  if (date > TODAY) continue;

  addTransaction({
    date, direction: "expense", type: "rekening", amount: spend,
    description: "Card settlement to Plastic Card", categoryName: null,
    account: MAIN_ACCOUNT, counterAccount: CARD_ACCOUNT, source: "csv_import",
  });
  addTransaction({
    date, direction: "income", type: "rekening", amount: spend,
    description: "Card settlement from Everyday Current", categoryName: null,
    account: CARD_ACCOUNT, counterAccount: MAIN_ACCOUNT, source: "csv_import",
  });
}

// ── Recurring items ──────────────────────────────────────────────────────────
// matchPattern is what links future booked transactions and the paid-this-month status
// back to the item; it is matched against the description (see recurring-match.ts), so
// it must be exactly the description the generated transactions use.

const RECURRING_START = HISTORY_START;

function addRecurring(values: {
  name: string;
  type: string;
  amount: number;
  frequency?: string;
  dueDay: number;
  categoryName: string;
  budgetType: string | null;
  matchPattern: string;
  icon?: string | null;
  iconColor?: string | null;
}): number {
  return insert("recurring_items", {
    name: values.name,
    type: values.type,
    amount: values.amount,
    frequency: values.frequency ?? "monthly",
    due_day: values.dueDay,
    start_date: RECURRING_START,
    category_id: cat(values.categoryName),
    budget_type: values.budgetType,
    active: 1,
    match_pattern: values.matchPattern,
    source: "manual",
    dismissed: 0,
  });
}

const recurringIdByName = new Map<string, number>();

for (const cost of FIXED_COSTS) {
  recurringIdByName.set(
    cost.name,
    addRecurring({
      name: cost.name,
      type: cost.recurringType,
      amount: cost.amount,
      dueDay: cost.dueDay,
      categoryName: cost.categoryName,
      budgetType: cost.budgetType,
      matchPattern: cost.name,
    }),
  );
}

// Income and the standing savings order — same table, different types.
addRecurring({
  name: "Salary Northwind Studios BV", type: "income", amount: SALARY_BASE, dueDay: SALARY_DAY,
  categoryName: "Salary", budgetType: null, matchPattern: "Salary Northwind Studios",
});
addRecurring({
  name: "Transfer to Savings Pot", type: "savings", amount: MONTHLY_SAVINGS, dueDay: 26,
  categoryName: "Savings", budgetType: "sparen", matchPattern: "Transfer to Savings Pot",
});

// Two non-monthly items, so the frequency handling has something to chew on.
insert("recurring_items", {
  name: "Home Contents Insurance", type: "bill", amount: 96, frequency: "quarterly", due_day: 10,
  start_date: iso(-(HISTORY_MONTHS - 1), 10), category_id: cat("Housing"), budget_type: "nodig",
  active: 1, match_pattern: "Home Contents Insurance", source: "manual", dismissed: 0,
});
insert("recurring_items", {
  name: "Domain & Hosting Renewal", type: "subscription", amount: 84, frequency: "yearly", due_day: 18,
  start_date: iso(-(HISTORY_MONTHS - 1), 18), category_id: cat("Apps & Software"), budget_type: "willen",
  active: 1, match_pattern: "Domain & Hosting Renewal", source: "manual", dismissed: 0,
});

// Link the generated transactions back to the item they belong to, which is what the
// live matcher would have done on import. Without it every fixed cost reads as one-off
// variable spending and the Budget portal's "recurring bills" handling has nothing to
// work with. Scoped to demo rows so a real transaction is never re-linked.
{
  const link = sqlite.prepare(`
    UPDATE transactions SET recurring_item_id = ?
    WHERE import_hash LIKE 'demo:%' AND recurring_item_id IS NULL AND description LIKE ?
  `);
  for (const item of sqlite.prepare(`SELECT id, match_pattern AS pattern FROM recurring_items WHERE match_pattern IS NOT NULL`).all() as Array<{ id: number; pattern: string }>) {
    link.run(item.id, `${item.pattern}%`);
  }
}

// ── Debts ────────────────────────────────────────────────────────────────────
// Payoff progress is derived from the linked recurring bill's paid-months history, so
// each "owe" debt is linked to the bill above that pays it off. startMonth is where
// tracking began; originalAmount on the student loan is larger than startingBalance
// because part of it was already repaid before then.

const DEBT_START_MONTH = HISTORY_START.slice(0, 7);

function addDebt(values: {
  name: string;
  direction: "owe" | "owed";
  startingBalance: number;
  originalAmount?: number | null;
  minimumPayment: number;
  startMonth?: string;
  endMonth?: string | null;
  color: string;
  icon: string;
  notes?: string | null;
  linkRecurring?: string;
}) {
  const startMonth = values.startMonth ?? DEBT_START_MONTH;
  const debtId = insert("debts", {
    name: values.name,
    direction: values.direction,
    starting_balance: values.startingBalance,
    original_amount: values.originalAmount ?? null,
    minimum_payment: values.minimumPayment,
    start_month: startMonth,
    start_date: `${startMonth}-01`,
    end_month: values.endMonth ?? null,
    color: values.color,
    icon: values.icon,
    notes: values.notes ?? null,
  });

  if (values.linkRecurring) {
    const recurringId = recurringIdByName.get(values.linkRecurring);
    if (recurringId === undefined) throw new Error(`No recurring item named "${values.linkRecurring}"`);
    sqlite.prepare(`INSERT INTO debt_recurring (debt_id, recurring_item_id) VALUES (?, ?)`).run(debtId, recurringId);
    // debt_recurring is a pure join table with no id of its own, so it gets its own
    // registry kind rather than the id-based 'insert' one.
    recordPayload.run("debt_recurring", "debt_recurring", null, JSON.stringify({ debtId, recurringId }));
  }
  return debtId;
}

addDebt({
  name: "Student Loan (DUO)", direction: "owe", startingBalance: 8400, originalAmount: 12600,
  minimumPayment: 185, color: "#ef4444", icon: "IconSchool",
  notes: "Repayment plan runs to 2031.", linkRecurring: "Student Loan Repayment",
});
addDebt({
  name: "Personal Loan", direction: "owe", startingBalance: 4500,
  minimumPayment: 125, color: "#f97316", icon: "IconBuildingBank",
  linkRecurring: "Personal Loan Repayment",
});
addDebt({
  name: "Credit Card Balance", direction: "owe", startingBalance: 1250,
  minimumPayment: 90, startMonth: iso(-6, 1).slice(0, 7), color: "#a855f7", icon: "IconCreditCard",
});
addDebt({
  name: "Lent to Mark", direction: "owed", startingBalance: 600,
  minimumPayment: 50, startMonth: iso(-5, 1).slice(0, 7), color: "#22c55e", icon: "IconUsers",
  notes: "Paying it back €50 a month.",
});

// ── Savings goals ────────────────────────────────────────────────────────────
// The /goals page reads the unified `goals` table filtered to goalType = "savings".

function addGoal(values: {
  name: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  endDate: string | null;
  color: string;
  icon: string;
}) {
  insert("goals", {
    goal_type: "savings",
    name: values.name,
    target_amount: values.targetAmount,
    current_amount: values.currentAmount,
    monthly_contribution: values.monthlyContribution,
    recurrence: "none",
    start_date: HISTORY_START,
    end_date: values.endDate,
    color: values.color,
    icon: values.icon,
    active: 1,
  });
}

addGoal({ name: "Emergency Fund",   targetAmount: 9000, currentAmount: 5400, monthlyContribution: 150, endDate: iso(14, 1),  color: "#14b8a6", icon: "IconShieldCheck" });
addGoal({ name: "Summer Holiday",   targetAmount: 2500, currentAmount: 1180, monthlyContribution: 100, endDate: iso(8, 1),   color: "#f59e0b", icon: "IconBeach" });
addGoal({ name: "New Laptop",       targetAmount: 1800, currentAmount: 620,  monthlyContribution: 75,  endDate: iso(11, 1),  color: "#3b82f6", icon: "IconDeviceLaptop" });
addGoal({ name: "Car Replacement",  targetAmount: 7500, currentAmount: 900,  monthlyContribution: 50,  endDate: iso(30, 1),  color: "#a855f7", icon: "IconCar" });

// ── Budget ───────────────────────────────────────────────────────────────────
// One active overall budget plus the per-category defaults (year 0 / month 0, the
// "applies to every month unless overridden" rows the Budget portal edits).

insert("budgets", { amount: 1600, period: "monthly", start_day: 1, active: 1 });

const CATEGORY_BUDGETS: Array<[string, number]> = [
  ["Groceries", 460],
  ["Restaurants & Bars", 150],
  ["Food Delivery", 60],
  ["Fuel", 140],
  ["Parking", 20],
  ["General Shopping", 110],
  ["Clothing", 80],
  ["Electronics", 60],
  ["Home Goods", 55],
  ["Cosmetics", 30],
  ["Medication", 25],
  ["Cinema", 25],
  ["Events", 40],
  // These two also carry a recurring item (the season ticket, iCloud), and in the
  // default "budgeted" recurring mode a budgeted category's recurring spend counts
  // towards its target — so the target has to cover the bill as well as the ad-hoc use.
  ["Public Transportation", 140],
  ["Apps & Software", 40],
  ["Gifts", 30],
  ["Hobbies", 50],
];

for (const [name, amount] of CATEGORY_BUDGETS) {
  insert("budget_targets", { year: 0, month: 0, category_id: cat(name), target_amount: amount });
}

// ── Manual asset accounts (net worth) ────────────────────────────────────────

insert("vermogen_accounts", {
  name: "Index Fund Portfolio", type: "beleggingen", value: 7420, color: "#6366f1",
  last_updated: shift(TODAY, -6), active: 1, include_in_net_worth: 1,
  notes: "Monthly automatic purchase.",
});
insert("vermogen_accounts", {
  name: "Volkswagen Polo", type: "bezitting", value: 8600, color: "#64748b",
  last_updated: shift(TODAY, -34), active: 1, include_in_net_worth: 1,
});
insert("vermogen_accounts", {
  name: "Cash Wallet", type: "betaalrekening", value: 145, color: "#22c55e",
  last_updated: shift(TODAY, -2), active: 1, include_in_net_worth: 1,
});

// ── Done ─────────────────────────────────────────────────────────────────────

const counts = sqlite
  .prepare(`SELECT table_name, COUNT(*) AS c FROM demo_seed WHERE kind = 'insert' GROUP BY table_name ORDER BY table_name`)
  .all() as Array<{ table_name: string; c: number }>;

console.log("Demo data seeded:");
for (const row of counts) console.log(`  ${row.table_name.padEnd(20)} ${row.c}`);
console.log(`\nHistory covers ${HISTORY_START} → ${TODAY}, plus bookings up to ${shift(TODAY, 48)}.`);
console.log("Run with --reset to remove it again.");

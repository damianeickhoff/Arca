import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ─── Categories ────────────────────────────────────────────────────────────
export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // bill | debt | subscription | variable | income | savings | "" (ungrouped)
  group: text("group").notNull().default(""),
  // nodig (need) | willen (want) | sparen (save) — not income; that's `group` instead
  budgetType: text("budget_type"),
  color: text("color"),
  icon: text("icon"),
  // true = seeded from src/config/categories.ts; not editable/deletable in the UI
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  // stable identity linking this row to its src/config/categories.ts entry (its `key`
  // field), so config renames update the row instead of creating a duplicate.
  // Null for user-created categories.
  configKey: text("config_key"),
  // Head category this one belongs to, if any. Max 2 levels: a category that itself
  // has a parentCategoryId can never be chosen as someone else's parent.
  parentCategoryId: integer("parent_category_id").references((): AnySQLiteColumn => categories.id, { onDelete: "set null" }),
  // Hides this category from the dashboard's "Spending by category" row (e.g. rent,
  // which would otherwise always dominate it) — still shown, and re-includable, from
  // that row's "View all" list.
  excludeFromSpendingRow: integer("exclude_from_spending_row", { mode: "boolean" }).notNull().default(false),
}, (t) => [
  uniqueIndex("categories_name_group_unique").on(t.name, t.group),
]);

// ─── Transactions ──────────────────────────────────────────────────────────
export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // ISO date string: YYYY-MM-DD
  // expense | income
  direction: text("direction").notNull(),
  // variabel | rekening | sparen | abonnement | schuld | inkomen
  type: text("type").notNull(),
  amount: real("amount").notNull(),
  correctedAmount: real("corrected_amount"),
  description: text("description").notNull(),
  rawDescription: text("raw_description"),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "cascade" }),
  // true = user assigned by hand; auto-rules will never overwrite
  manuallyCategorized: integer("manually_categorized", { mode: "boolean" }).notNull().default(false),
  // manual | csv_import
  source: text("source").notNull().default("manual"),
  importHash: text("import_hash").unique(), // dedup CSV imports
  account: text("account"), // "Rekening" column from CSV; null for manual entries
  counterAccount: text("counter_account"), // "Tegenrekening" from CSV; used to detect own-account transfers
  brandIcon: text("brand_icon"),
  brandIconColor: text("brand_icon_color"),
  brandIconBgColor: text("brand_icon_bg_color"),
  notes: text("notes"),
  customName: text("custom_name"),
  // Per-transaction override of the category's budget type (nodig/willen/sparen).
  // Only applies to this one transaction; the category's own budgetType is untouched.
  budgetTypeOverride: text("budget_type_override"),
  // true = manually marked as own-account transfer (e.g. Google Pay without counter account)
  isManualTransfer: integer("is_manual_transfer", { mode: "boolean" }).notNull().default(false),
  // true = this is a Tikkie/reimbursement received (not real income)
  isReimbursement: integer("is_reimbursement", { mode: "boolean" }).notNull().default(false),
  // true = skip this transaction in budget reports and dashboards
  excludeFromReports: integer("exclude_from_reports", { mode: "boolean" }).notNull().default(false),
  // How much you expect to get back from this expense (other person's share).
  // null = assume full amount (legacy). Set when linking a Tikkie.
  expectedReimbursement: real("expected_reimbursement"),
  // Path under /uploads/receipts/ for a photographed receipt/invoice, if attached.
  receiptUrl: text("receipt_url"),
  // Links this transaction to a savings goal (see `goals` below, goalType = "savings").
  // The transaction's amount is added to or removed from that goal's currentAmount —
  // see src/lib/goal-contributions.ts for the add/remove logic.
  goalId: integer("goal_id").references(() => goals.id, { onDelete: "set null" }),
  // Set when a transaction matches an active recurring item (see src/lib/recurring-match.ts).
  // Drives the auto-assigned category and the recurring item's friendly-name override.
  recurringItemId: integer("recurring_item_id").references(() => recurringItems.id, { onDelete: "set null" }),
  // Manual override for the internal-transfer sub-type (savings/investments/credit_card_payment/
  // cash_withdrawal/shared_account/other). Null = derive it from the opposite account's
  // banks.transferKind (see src/lib/internal-transfers.ts effectiveTransferTypeExpr).
  transferType: text("transfer_type"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const transactionSplits = sqliteTable("transaction_splits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// ─── Reimbursements ─────────────────────────────────────────────────────────
// Links an incoming Tikkie (reimbursementTransactionId) to the original
// expense it partially or fully covers (originalTransactionId).
export const reimbursements = sqliteTable("reimbursements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reimbursementTransactionId: integer("reimbursement_transaction_id")
    .notNull().references(() => transactions.id, { onDelete: "cascade" }),
  originalTransactionId: integer("original_transaction_id")
    .notNull().references(() => transactions.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// ─── Recurring items ────────────────────────────────────────────────────────
export const recurringItems = sqliteTable("recurring_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // bill | debt | subscription
  type: text("type").notNull(),
  amount: real("amount"),
  // daily | weekly | monthly | quarterly | yearly | once
  frequency: text("frequency").notNull().default("monthly"),
  dueDay: integer("due_day"), // day of month (1-31); derived from startDate's day when set
  // Period: the recurrence's start (anchor/first due date) and an optional end date.
  // Once endDate has passed the item is auto-disabled (see disableExpiredRecurring).
  startDate: text("start_date"), // ISO date YYYY-MM-DD
  endDate: text("end_date"),     // ISO date YYYY-MM-DD, optional
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "cascade" }),
  // nodig | willen
  budgetType: text("budget_type"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  notes: text("notes"),
  icon: text("icon"),
  iconColor: text("icon_color"),
  matchPattern: text("match_pattern"),
  matchAmount: real("match_amount"), // exact-amount mode: also require this amount to match
  // "between" (range) amount mode: match when the amount falls within [min, max]. When either
  // is set it takes precedence over matchAmount. Both null → no amount constraint.
  matchAmountMin: real("match_amount_min"),
  matchAmountMax: real("match_amount_max"),
  // Overrides friendlyNames.ts / raw description for every transaction this item matches.
  friendlyName: text("friendly_name"),
  // "manual" (user-created) | "auto" (created by the recurring detector).
  source: text("source").notNull().default("manual"),
  // Stable dedupe/suppression key for auto items: `normalizedPattern|amountBucket`.
  signature: text("signature"),
  // Soft-delete for auto items: a dismissed false positive stays as a row (so detection's
  // suppression guard never recreates it) but is inactive and hidden from the active list.
  dismissed: integer("dismissed", { mode: "boolean" }).notNull().default(false),
});

// ─── Savings goals ─────────────────────────────────────────────────────────
export const savingsGoals = sqliteTable("savings_goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  targetAmount: real("target_amount").notNull(),
  currentAmount: real("current_amount").notNull().default(0),
  monthlyContribution: real("monthly_contribution"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  color: text("color"),
  icon: text("icon"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

// ─── Goals ───────────────────────────────────────────────────────────────────
// Combined budgeting + savings goals surfaced on /goals. `goalType` distinguishes
// an expense goal (a spending cap to stay under) from a savings goal (a target to
// build up to). Kept separate from savingsGoals so the existing savings page is
// untouched while the new unified page owns its own data.
export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  goalType: text("goal_type").notNull(), // expense | savings
  name: text("name").notNull(),
  targetAmount: real("target_amount").notNull().default(0),
  currentAmount: real("current_amount").notNull().default(0),
  monthlyContribution: real("monthly_contribution"),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  recurrence: text("recurrence").notNull().default("none"), // none | weekly | monthly | yearly
  startDate: text("start_date"),
  endDate: text("end_date"),
  color: text("color"),
  icon: text("icon"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// ─── Category rules ─────────────────────────────────────────────────────────
export const categoryRules = sqliteTable("category_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  namePattern: text("name_pattern"),     // match against transaction description (optional)
  nameWildcard: integer("name_wildcard", { mode: "boolean" }).notNull().default(true), // true = contains, false = exact
  nameWholeWord: integer("name_whole_word", { mode: "boolean" }).notNull().default(false), // true = whole word boundary match
  amount: real("amount"),                // match exact amount (optional)
  amountMin: real("amount_min"),         // range match: lower bound (optional)
  amountMax: real("amount_max"),         // range match: upper bound (optional)
  direction: text("direction"),          // "income" | "expense" | null (null = both)
  bankId: integer("bank_id").references(() => banks.id, { onDelete: "set null" }), // restrict to specific bank account (optional)
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// ─── Budget targets ────────────────────────────────────────────────────────
export const budgetTargets = sqliteTable("budget_targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 1-12
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "cascade" }),
  targetAmount: real("target_amount").notNull(),
});

// ─── Overall budget ──────────────────────────────────────────────────────────
// A single active overall spending budget for the current period. The amount is the
// overall limit; category-level budgets continue to live in `budgetTargets` (defaults,
// year=0/month=0) and their sum is what the portal calls "allocated". `startDay` is a
// day-of-month (1–28) for monthly budgets or a day-of-week (0=Sun … 6=Sat) for weekly.
export const budgets = sqliteTable("budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  amount: real("amount").notNull(),
  period: text("period").notNull().default("monthly"), // 'weekly' | 'monthly'
  startDay: integer("start_day").notNull().default(1),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// ─── Debts ──────────────────────────────────────────────────────────────────
export const debts = sqliteTable("debts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // "owe"  = money you owe someone else (a debt to pay off).
  // "owed" = money someone owes you (incoming). Same fields/payoff model, framed
  // as incoming, and netted against "owe" totals in the debts overview.
  direction: text("direction").notNull().default("owe"),
  startingBalance: real("starting_balance").notNull(),
  // Optional true original amount (e.g. the loan's original size), when it's larger
  // than startingBalance because tracking began after some of it was already paid
  // off. Null = keep the old behavior (startingBalance is treated as the total).
  originalAmount: real("original_amount"),
  minimumPayment: real("minimum_payment").notNull().default(0),
  startMonth: text("start_month").notNull(), // YYYY-MM
  endMonth: text("end_month"), // YYYY-MM — optional payoff/payout target, drives the auto-computed monthly amount
  color: text("color"),
  icon: text("icon"),
  notes: text("notes"),
});

// ─── Debt ↔ Category (many-to-many) ─────────────────────────────────────────
// Debts are linked to the recurring bills that pay them off — payoff progress is
// derived from those bills' paid-months history (see app/debts/page.tsx). This
// replaced the older debt_categories link (summing transactions in linked
// categories), which is no longer used.
export const debtRecurring = sqliteTable("debt_recurring", {
  debtId: integer("debt_id").notNull().references(() => debts.id, { onDelete: "cascade" }),
  recurringItemId: integer("recurring_item_id").notNull().references(() => recurringItems.id, { onDelete: "cascade" }),
});

// ─── App settings ────────────────────────────────────────────────────────────
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export const financialMonthOverrides = sqliteTable("financial_month_overrides", {
  month: text("month").primaryKey(), // YYYY-MM
  startDay: integer("start_day").notNull(), // 1-28
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// ─── Brand icon rules ────────────────────────────────────────────────────────
export const brandIconRules = sqliteTable("brand_icon_rules", {
  id:           integer("id").primaryKey({ autoIncrement: true }),
  namePattern:  text("name_pattern").notNull(),
  nameWildcard: integer("name_wildcard", { mode: "boolean" }).notNull().default(true),
  nameWholeWord: integer("name_whole_word", { mode: "boolean" }).notNull().default(false),
  brandIcon:    text("brand_icon").notNull(),
  iconColor:    text("icon_color"),
  iconBgColor:  text("icon_bg_color"),
});

export type BrandIconRule = typeof brandIconRules.$inferSelect;
export type NewBrandIconRule = typeof brandIconRules.$inferInsert;

// ─── Savings month overrides ──────────────────────────────────────────────────
// Per-goal, per-month contribution override. Does not touch monthlyContribution.
export const savingsMonthOverrides = sqliteTable("savings_month_overrides", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  goalId: integer("goal_id").notNull().references(() => savingsGoals.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // YYYY-MM
  overrideAmount: real("override_amount").notNull(),
});

// ─── Prognose overrides ───────────────────────────────────────────────────────
export const prognoseOverrides = sqliteTable("prognose_overrides", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recurringItemId: integer("recurring_item_id").notNull().references(() => recurringItems.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // YYYY-MM
  amount: real("amount").notNull(),
});

// ─── Variable prognose overrides ──────────────────────────────────────────────
// Per-category, per-month budget override specifically for the prognose page.
// Overrides the budget target from budgetTargets for projection purposes only.
export const variablePrognoseOverrides = sqliteTable("variable_prognose_overrides", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // YYYY-MM
  overrideAmount: real("override_amount").notNull(),
});

// ─── Banks ──────────────────────────────────────────────────────────────────
export const banks = sqliteTable("banks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountNumber: text("account_number").unique(), // from CSV "Rekening"; null = custom bank
  displayName: text("display_name"),
  icon: text("icon"),   // account glyph shown in the edit sheet / accounts overview
  color: text("color"), // accent color for the glyph + dialog wash
  cardType: text("card_type"), // "debitcard" | "creditcard" | "savings" | "cash"
  expirationDate: text("expiration_date"), // YYYY-MM-DD
  // Manually-set opening balance for this account, e.g. the balance at the moment a
  // CSV import first introduced it (import history rarely goes back to account opening).
  // Added to the transaction-derived balance for display; never included in reports,
  // budgets, or any spending calculation — those stay transaction-only.
  startingBalance: real("starting_balance"),
  startingDate: text("starting_date"), // ISO date YYYY-MM-DD
  // Tags this account's "kind" for auto-detecting internal-transfer sub-types: when a
  // transfer's opposite account has this set, the transfer inherits it (see
  // transactions.transferType / src/lib/internal-transfers.ts effectiveTransferTypeExpr).
  // savings | investments | credit_card_payment | cash_withdrawal | shared_account | other
  transferKind: text("transfer_kind"),
  includeInNetWorth: integer("include_in_net_worth", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export type Bank = typeof banks.$inferSelect;
export type NewBank = typeof banks.$inferInsert;

// ─── Import profiles ──────────────────────────────────────────────────────────
// A saved column mapping for a CSV header shape that none of the built-in bank
// parsers (src/lib/bank-parsers) recognise. Once a user maps an unrecognized bank's
// export once, later imports with the same header signature auto-apply it instead
// of asking again — see src/lib/import-profiles.ts.
export const importProfiles = sqliteTable("import_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  // Normalized, joined header row — used to recognise "this is the same bank again".
  headerSignature: text("header_signature").notNull().unique(),
  mapping: text("mapping").notNull(), // JSON-encoded ColumnMapping
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export type ImportProfile = typeof importProfiles.$inferSelect;

// ─── Vermogen accounts ───────────────────────────────────────────────────────
// Manual asset tracking for net worth calculation.
// Types: spaarrekening | beleggingen | betaalrekening | bezitting
export const vermogenAccounts = sqliteTable("vermogen_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull(), // spaarrekening | beleggingen | betaalrekening | bezitting
  value: real("value").notNull().default(0),
  color: text("color"),
  notes: text("notes"),
  lastUpdated: text("last_updated"), // ISO date YYYY-MM-DD
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  includeInNetWorth: integer("include_in_net_worth", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});
export type VermogenAccount = typeof vermogenAccounts.$inferSelect;
export type NewVermogenAccount = typeof vermogenAccounts.$inferInsert;

// ─── Bill payments ────────────────────────────────────────────────────────────
// Manual "mark as paid" overrides for recurring items, one row per (item, month).
// Auto-matching (recurringItems.matchPattern/matchAmount against transactions) stays
// the primary source of truth for paid status; a row here means the user manually
// marked/unmarked that month, which always wins over the auto-match result.
export const billPayments = sqliteTable("bill_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recurringItemId: integer("recurring_item_id").notNull().references(() => recurringItems.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // financial month, YYYY-MM
  transactionId: integer("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
  amount: real("amount"),
  paidAt: text("paid_at").default(sql`(datetime('now'))`),
}, (t) => [
  uniqueIndex("bill_payments_item_month_unique").on(t.recurringItemId, t.month),
]);
export type BillPayment = typeof billPayments.$inferSelect;
export type NewBillPayment = typeof billPayments.$inferInsert;

// ─── Net worth snapshots ──────────────────────────────────────────────────────
// One row per calendar day, recorded automatically when the Reports page is
// visited. Powers the net worth trend chart — without this there is no
// historical net worth data, only the current live total.
export const netWorthSnapshots = sqliteTable("net_worth_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(), // ISO date YYYY-MM-DD
  netWorth: real("net_worth").notNull(),
  totalAssets: real("total_assets").notNull(),
  totalDebt: real("total_debt").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});
export type NetWorthSnapshot = typeof netWorthSnapshots.$inferSelect;
export type NewNetWorthSnapshot = typeof netWorthSnapshots.$inferInsert;

// ─── Users ──────────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  name: text("name").notNull(),
  // Split profile fields collected during onboarding. `name` stays populated as
  // "First Last" for compatibility with existing code that reads users.name.
  firstName: text("first_name"),
  lastName: text("last_name"),
  birthday: text("birthday"), // ISO date string: YYYY-MM-DD
  passwordHash: text("password_hash").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  avatarUrl: text("avatar_url"),
  // TOTP (Google Authenticator) MFA. totpSecret must stay reversible (base32 plaintext) to
  // compute codes, so unlike passwordHash it can't be bcrypt-hashed — set on enrollment
  // start, kept even before totpEnabled flips true (confirmTotpEnrollmentAction verifies a
  // code against it first). totpBackupCodes is a JSON array of bcrypt hashes, single-use.
  totpSecret: text("totp_secret"),
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
  totpBackupCodes: text("totp_backup_codes"),
  // Preset id (see src/lib/auth-background.ts) for this user's own dashboard color fade.
  // Null = use the default preset. Per-user rather than app-wide so family members
  // sharing one install can each pick their own.
  authBackground: text("auth_background"),
  // Set only when the onboarding wizard's final "Finish" step completes — the account
  // row itself is created much earlier (leaving the password step), so this is the only
  // reliable "is onboarding actually done" signal (see src/app/register/page.tsx and
  // src/app/api/onboarding/finish/route.ts). Defaults true so the ALTER TABLE migration
  // that adds this column marks every pre-existing user (who onboarded before this
  // column existed) as already complete.
  onboardingComplete: integer("onboarding_complete", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
}, (t) => [
  uniqueIndex("users_email_unique").on(t.email),
]);

// ─── Sessions ───────────────────────────────────────────────────────────────
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // random session token, generated in app code
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// ─── MFA challenges ───────────────────────────────────────────────────────────
// Short-lived state for a login that passed the password check but is waiting on a
// TOTP/backup code. Needed because no session exists yet, and app_settings (used by the
// app-lock feature) is a single global k/v row, not per-attempt/per-user — see
// src/app/actions/auth.ts loginAction/verifyMfaAction.
export const mfaChallenges = sqliteTable("mfa_challenges", {
  id: text("id").primaryKey(), // random token, held in an httpOnly "mfa_pending" cookie
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rememberMe: integer("remember_me", { mode: "boolean" }).notNull().default(false),
  redirectTo: text("redirect_to"), // carries the login form's "next" across the MFA step
  attempts: integer("attempts").notNull().default(0),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type MfaChallenge = typeof mfaChallenges.$inferSelect;
export type NewMfaChallenge = typeof mfaChallenges.$inferInsert;

// ─── Types ──────────────────────────────────────────────────────────────────
export type Reimbursement = typeof reimbursements.$inferSelect;
export type NewReimbursement = typeof reimbursements.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type TransactionSplit = typeof transactionSplits.$inferSelect;
export type NewTransactionSplit = typeof transactionSplits.$inferInsert;
export type RecurringItem = typeof recurringItems.$inferSelect;
export type NewRecurringItem = typeof recurringItems.$inferInsert;
export type SavingsGoal = typeof savingsGoals.$inferSelect;
export type NewSavingsGoal = typeof savingsGoals.$inferInsert;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type CategoryRule = typeof categoryRules.$inferSelect;
export type NewCategoryRule = typeof categoryRules.$inferInsert;
export type Debt = typeof debts.$inferSelect;
export type NewDebt = typeof debts.$inferInsert;
export type DebtRecurring = typeof debtRecurring.$inferSelect;
export type FinancialMonthOverride = typeof financialMonthOverrides.$inferSelect;
export type PrognoseOverride = typeof prognoseOverrides.$inferSelect;
export type SavingsMonthOverride = typeof savingsMonthOverrides.$inferSelect;
export type VariablePrognoseOverride = typeof variablePrognoseOverrides.$inferSelect;

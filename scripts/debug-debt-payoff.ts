/**
 * Read-only diagnostic: prints every payoff figure the app derives for each debt, so a
 * disagreement between two surfaces can be traced to the input that causes it.
 *
 * Run against a copy of the database you want to inspect:
 *   DB_PATH=/path/to/finance.db node --experimental-strip-types scripts/debug-debt-payoff.ts
 *
 * Opens the file in readonly mode and never writes. The formulas below mirror, in order:
 *   computeDebt            — src/app/debts/debt-shared.ts  (the debt page + detail sheet)
 *   computeDebtBillEndDate — src/app/debts/debt-shared.ts  (the linked bill's End date)
 *   paidFor                — src/lib/debt-recurring-paid.ts (progress from paid months)
 * They are inlined rather than imported so the script needs no path-alias/build setup.
 */
import Database from "better-sqlite3";
// The real interest maths, imported rather than copied so this can't drift from the app.
// (debt-shared.ts can't be imported the same way — it uses "@/" path aliases that bare
// node won't resolve, so the date logic below mirrors it and is asserted against it by
// the date-logic harness described in the plan.)
import { monthlyRate, payoffMonths, applyPayments, totalInterest } from "../src/lib/debt-interest.ts";

const DB_PATH = process.env.DB_PATH || "finance.db";
const db = new Database(DB_PATH, { readonly: true });

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Mirrors scheduledPaymentMonths: first instalment one month AFTER `fromDate`. */
function scheduledPaymentMonths(fromDate: string, toDate: string): string[] {
  const addM = (month: string, n: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const last = toDate.slice(0, 7);
  const months: string[] = [];
  let cursor = addM(fromDate.slice(0, 7), 1);
  for (let i = 0; i < 1200 && cursor <= last; i++) {
    months.push(cursor);
    cursor = addM(cursor, 1);
  }
  return months;
}

/** Mirrors firstOutstandingMonth. */
function firstOutstandingMonth(balanceDate: string, lastRecordedMonth: string | null): string {
  const scheduled = scheduledPaymentMonths(balanceDate, iso(new Date()));
  const covered = [balanceDate.slice(0, 7), scheduled.at(-1) ?? "", lastRecordedMonth ?? ""].reduce((a, b) =>
    a > b ? a : b,
  );
  const [y, m] = covered.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function addMonths(startDate: string, n: number): string {
  const [y, m, d] = startDate.split("-").map(Number);
  return iso(new Date(y, m - 1 + n, d || 1));
}

type DebtRow = {
  id: number; name: string; direction: string;
  starting_balance: number; original_amount: number | null;
  minimum_payment: number; interest_rate: number | null;
  start_month: string; start_date: string | null; balance_date: string | null;
};
type BillRow = {
  id: number; name: string; type: string; amount: number | null;
  frequency: string; start_date: string | null; end_date: string | null;
  match_pattern: string | null;
};

// interest_rate is added by the boot-time auto-migration (src/db/index.ts), so a database
// whose app hasn't restarted yet won't have it. Select it only when it exists rather than
// failing outright — this script's whole job is to run against a database as it is.
const debtColumns = (db.prepare(`PRAGMA table_info(debts)`).all() as { name: string }[]).map((c) => c.name);
const hasInterest = debtColumns.includes("interest_rate");
const hasBalanceDate = debtColumns.includes("balance_date");
const debts = db.prepare(`
  SELECT id, name, direction, starting_balance, original_amount, minimum_payment,
         ${hasInterest ? "interest_rate" : "NULL AS interest_rate"}, start_month, start_date,
         ${hasBalanceDate ? "balance_date" : "NULL AS balance_date"}
  FROM debts ORDER BY name
`).all() as DebtRow[];

if (!hasInterest) console.log("note: this database has no interest_rate column yet — every debt is treated as interest-free");
if (!hasBalanceDate) console.log("note: this database has no balance_date column yet — every balance is measured from its start date");
if (!hasInterest || !hasBalanceDate) console.log();

const billsFor = db.prepare(`
  SELECT r.id, r.name, r.type, r.amount, r.frequency, r.start_date, r.end_date, r.match_pattern
  FROM recurring_items r
  JOIN debt_recurring dr ON dr.recurring_item_id = r.id
  WHERE dr.debt_id = ?
`);

// Manual marks and matched transactions, per linked bill. Direction matters: a debt you
// owe is settled by expenses, one you are owed by the income coming back to you.
const marksFor = db.prepare(`
  SELECT month, amount FROM bill_payments WHERE recurring_item_id = ? ORDER BY month
`);
const txMatching = db.prepare(`
  SELECT date, description, amount, direction FROM transactions
  WHERE direction = ? AND lower(description) LIKE '%' || lower(?) || '%'
  ORDER BY date
`);

console.log(`database: ${DB_PATH}`);
console.log(`today:    ${iso(new Date())}\n`);

for (const debt of debts) {
  const startDate = debt.start_date ?? `${debt.start_month}-01`;
  const P = debt.minimum_payment;
  const bills = billsFor.all(debt.id) as BillRow[];
  const owed = debt.direction === "owed";
  const wantedDirection = owed ? "income" : "expense";

  console.log("─".repeat(78));
  console.log(`${debt.name}  [${debt.direction}]  id=${debt.id}`);
  console.log(`  starting balance   ${debt.starting_balance}`);
  if (debt.original_amount != null) console.log(`  original amount    ${debt.original_amount}`);
  console.log(`  minimum payment    ${P}`);
  const balanceDate = debt.balance_date ?? startDate;
  const assumedMonths = scheduledPaymentMonths(balanceDate, iso(new Date()));
  console.log(`  start date         ${startDate}`);
  console.log(`  balance as of      ${balanceDate}   (${assumedMonths.length} scheduled payments since)`);
  if (balanceDate === startDate && assumedMonths.length > 0) {
    console.log(`      ⚠ balance is measured from the START date, so ${assumedMonths.length} months of payments are ASSUMED.`);
    console.log(`        Set "Balance as of" to today in the debt editor to use the balance as entered.`);
  }

  if (P <= 0) { console.log("  minimum payment is 0 — no payoff projection possible\n"); continue; }

  // Progress from the linked bills' paid months (null when the debt has no links).
  let billPaid: number | null = null;
  if (bills.length > 0) {
    billPaid = 0;
    console.log(`  linked bills:`);
    for (const b of bills) {
      const marks = marksFor.all(b.id) as { month: string; amount: number | null }[];
      const matched = b.match_pattern
        ? (txMatching.all(wantedDirection, b.match_pattern) as { date: string; amount: number }[])
        : [];
      const markTotal = marks.reduce((s, m) => s + (m.amount ?? b.amount ?? 0), 0);
      const markedMonths = new Set(marks.map((m) => m.month));
      const autoMonths = new Set(matched.map((t) => t.date.slice(0, 7)));
      for (const m of markedMonths) autoMonths.delete(m);
      const autoTotal = autoMonths.size * (b.amount ?? 0);
      billPaid += markTotal + autoTotal;

      console.log(`    · ${b.name}  amount=${b.amount}  type=${b.type}  freq=${b.frequency}`);
      console.log(`      period ${b.start_date ?? "—"} → ${b.end_date ?? "—"}   pattern=${b.match_pattern ?? "—"}`);
      console.log(`      manual marks: ${marks.length} (${markTotal})   auto-matched ${wantedDirection} months: ${autoMonths.size} (${autoTotal})`);
      // The gross-vs-principal check: a repayment that includes interest is credited
      // in full against the principal, which runs progress ahead of reality.
      if (b.amount != null && Math.abs(b.amount - P) > 0.005) {
        console.log(`      ⚠ bill amount ${b.amount} ≠ debt minimum payment ${P} (difference ${(b.amount - P).toFixed(2)}/month)`);
      }
    }
  } else {
    console.log(`  linked bills:      none — assumed schedule since the balance date`);
  }

  const rate = monthlyRate(debt.interest_rate);
  if (rate > 0) console.log(`  interest rate      ${debt.interest_rate}% per year`);
  else console.log(`  interest rate      none (flat balance ÷ payment)`);

  // Interest replays the history month by month; without it every euro comes straight
  // off the balance, which is the arithmetic this app used before rates existed.
  const n = assumedMonths.length;
  const paymentSeq = billPaid !== null
    ? Array.from({ length: n }, () => billPaid / Math.max(1, n))
    : Array.from({ length: n }, () => P);
  const currentBalance = rate > 0
    ? applyPayments(debt.starting_balance, rate, paymentSeq)
    : Math.max(debt.starting_balance - Math.min(billPaid ?? n * P, debt.starting_balance), 0);
  const amountPaid = Math.max(debt.starting_balance - currentBalance, 0);
  const monthsRemaining = currentBalance > 0 ? payoffMonths(currentBalance, P, rate) : 0;
  if (monthsRemaining === null) {
    console.log(`\n  ⚠ the payment of ${P} never covers the interest on ${currentBalance.toFixed(2)} — this debt never pays off\n`);
    continue;
  }
  if (rate > 0) console.log(`  interest remaining ${totalInterest(currentBalance, P, rate).toFixed(2)}`);

  const anchorMonth = firstOutstandingMonth(balanceDate, null);
  const [ay, am] = anchorMonth.split("-").map(Number);
  const day = Number(startDate.slice(8, 10)) || 1;
  const lastPayment = monthsRemaining > 0
    ? (() => {
        const d = new Date(ay, am - 1 + (monthsRemaining - 1), 1);
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(day, lastDay));
        return iso(d);
      })()
    : null;

  // The linked bill's stored End date: full starting balance projected from the START
  // date. First instalment falls one month after the start date, so N payments end N
  // months out — this should now equal the last-payment date above.
  const billTermMonths = payoffMonths(debt.starting_balance, P, rate) ?? 0;
  const billEndDate = billTermMonths > 0 ? addMonths(startDate, billTermMonths) : "—";

  console.log(`\n  → amount paid       ${amountPaid.toFixed(2)}   (${billPaid !== null ? "from linked bills" : "assumed schedule"})`);
  console.log(`  → current balance   ${currentBalance.toFixed(2)}`);
  console.log(`  → months remaining  ${monthsRemaining}  (next payment ${anchorMonth})`);
  console.log(`  → LAST PAYMENT ON   ${lastPayment ?? "settled"}      [debt page + detail sheet]`);
  console.log(`  → BILL END DATE     ${billEndDate}      [computeDebtBillEndDate, ${billTermMonths} payments from ${startDate}]`);
  for (const b of bills) {
    if (b.end_date && b.end_date !== billEndDate) {
      console.log(`  ⚠ stored end date on "${b.name}" is ${b.end_date} — stale, only rewritten when the debt is saved`);
    }
  }
  console.log();
}

db.close();

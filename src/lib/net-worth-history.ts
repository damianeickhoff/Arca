// Insights › Net worth: how each account's value moved over time, rebuilt from what the
// app already stores, and the sums the page draws from it. No database access here —
// src/app/net-worth/load-net-worth.ts loads the rows and hands them over.
//
// Where a value comes from decides how its history is rebuilt:
//   • synced bank accounts — today's balance minus every transaction after the date;
//   • values you keep by hand — the last value entered on or before the date
//     (vermogen_account_values, plus the account's own value and last_updated);
//   • savings goals — today's amount minus the contributions linked after the date;
//   • debts — the Debts page's own balance maths at that date (done by the loader).
// Before the first known value an account reads as that first value, so adding an
// account doesn't show up as a jump in net worth.

// ── Range ───────────────────────────────────────────────────────────────────

export const NET_WORTH_RANGES = ["1m", "3m", "6m", "1y"] as const;
export type NetWorthRange = (typeof NET_WORTH_RANGES)[number];

export function parseNetWorthRange(value: string | null | undefined): NetWorthRange {
  return (NET_WORTH_RANGES as readonly string[]).includes(value ?? "") ? (value as NetWorthRange) : "6m";
}

export function rangeMonthCount(range: NetWorthRange): number {
  return range === "1m" ? 1 : range === "3m" ? 3 : range === "6m" ? 6 : 12;
}

function parse(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setDate(d.getDate() + days);
  return iso(d);
}

/** Whole days from a to b (negative when b is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

/** The same day `months` months back (the last day of a shorter month). */
export function monthsBack(date: string, months: number): string {
  const d = parse(date);
  const target = new Date(d.getFullYear(), d.getMonth() - months, 1, 12);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return iso(target);
}

/** `count` dates spread evenly from `start` to `end`, both included, oldest first. */
export function sampleDates(start: string, end: string, count = 13): string[] {
  const span = Math.max(0, daysBetween(start, end));
  if (span === 0) return [end];
  const n = Math.min(count, span + 1);
  const dates = Array.from({ length: n }, (_, i) => addDays(start, Math.round((i * span) / (n - 1))));
  return [...new Set(dates)];
}

// ── Value at a date ─────────────────────────────────────────────────────────

const cents = (v: number) => Math.round(v * 100) / 100;

/**
 * A synced account's balance on each date: today's balance minus everything that moved
 * after that date. `flows` are signed (in +, out −), one per day or per transaction.
 */
export function balanceSeries(live: number, flows: { date: string; amount: number }[], dates: string[]): number[] {
  return dates.map((d) => cents(live - flows.reduce((s, f) => (f.date > d ? s + f.amount : s), 0)));
}

/**
 * A goal's amount on each date: today's amount minus the contributions linked to it
 * after that date (deposits +, withdrawals −).
 */
export function contributionSeries(current: number, contributions: { date: string; amount: number }[], dates: string[]): number[] {
  return balanceSeries(current, contributions, dates);
}

export interface ValuePoint {
  date: string;
  value: number;
}

/**
 * Every value a hand-kept account has had: the recorded history plus its current
 * value, dated on its last update (or today when it has none and differs from the last
 * recorded one). Sorted, one per date (the later entry wins).
 */
export function manualHistory(entries: ValuePoint[], current: { value: number; lastUpdated: string | null }, today: string): ValuePoint[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const lastRecorded = sorted.at(-1);
  const date = current.lastUpdated ?? (lastRecorded && lastRecorded.value !== current.value ? today : (lastRecorded?.date ?? today));
  const byDate = new Map<string, number>();
  for (const e of sorted) byDate.set(e.date, e.value);
  // The account's own value is the truth for its last-updated date and after.
  for (const d of [...byDate.keys()]) if (d > date) byDate.delete(d);
  byDate.set(date, current.value);
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, value]) => ({ date: d, value }));
}

/** The value on each date: the last point on or before it, else the first point. */
export function stepSeries(points: ValuePoint[], dates: string[]): number[] {
  if (points.length === 0) return dates.map(() => 0);
  return dates.map((d) => {
    let value = points[0].value;
    for (const p of points) {
      if (p.date > d) break;
      value = p.value;
    }
    return value;
  });
}

/** The biggest hand-entered change inside (from, to], for the "updated by hand" note. */
export function biggestStep(points: ValuePoint[], from: string, to: string): { date: string; delta: number } | null {
  let best: { date: string; delta: number } | null = null;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.date <= from || p.date > to) continue;
    const delta = p.value - points[i - 1].value;
    if (delta !== 0 && (!best || Math.abs(delta) > Math.abs(best.delta))) best = { date: p.date, delta: cents(delta) };
  }
  return best;
}

/** Whether a hand-kept value is due for an update (older than `days`, or never dated). */
export function isStale(lastUpdated: string | null, today: string, days = 60): boolean {
  return lastUpdated == null || daysBetween(lastUpdated, today) > days;
}

// ── Stacking ────────────────────────────────────────────────────────────────

export type AssetKind = "cash" | "investments" | "things";

export interface SeriesAccount {
  key: string;
  side: "asset" | "debt";
  /** For assets: which band of the chart it is in. */
  kind?: AssetKind;
  /** Positive amounts, one per date (a debt's balance owed). */
  values: number[];
}

export interface StackedSeries {
  cash: number[];
  investments: number[];
  things: number[];
  /** The largest debt today, on its own band. */
  mainDebt: number[];
  mainDebtKey: string | null;
  /** Every other debt together. */
  otherDebts: number[];
  assets: number[];
  debts: number[];
  net: number[];
}

/** Assets per kind above zero, the largest debt and the rest below it, and net worth. */
export function stackSeries(accounts: SeriesAccount[], length: number): StackedSeries {
  const zero = () => Array.from({ length }, () => 0);
  const out = { cash: zero(), investments: zero(), things: zero(), mainDebt: zero(), otherDebts: zero() };
  const debts = accounts.filter((a) => a.side === "debt");
  const main = debts.reduce<SeriesAccount | null>((best, d) => (!best || (d.values.at(-1) ?? 0) > (best.values.at(-1) ?? 0) ? d : best), null);
  for (const a of accounts) {
    const band = a.side === "debt" ? (a === main ? out.mainDebt : out.otherDebts) : out[a.kind ?? "cash"];
    a.values.forEach((v, i) => {
      if (i < length) band[i] += v;
    });
  }
  const round = (xs: number[]) => xs.map(cents);
  const cash = round(out.cash);
  const investments = round(out.investments);
  const things = round(out.things);
  const mainDebt = round(out.mainDebt);
  const otherDebts = round(out.otherDebts);
  const assets = cash.map((v, i) => cents(v + investments[i] + things[i]));
  const debtTotal = mainDebt.map((v, i) => cents(v + otherDebts[i]));
  return {
    cash,
    investments,
    things,
    mainDebt,
    mainDebtKey: main?.key ?? null,
    otherDebts,
    assets,
    debts: debtTotal,
    net: assets.map((v, i) => cents(v - debtTotal[i])),
  };
}

// ── What changed this month ─────────────────────────────────────────────────

export const CHANGE_GROUPS = ["contributions", "debts", "manual", "cash"] as const;
export type ChangeGroup = (typeof CHANGE_GROUPS)[number];

export interface ChangeInput {
  key: string;
  group: ChangeGroup;
  /** Value at the start and now; for a debt you owe, the balance owed. */
  start: number;
  end: number;
  /** A debt you owe: paying it down raises net worth. */
  owed?: boolean;
}

export interface ChangeItem extends ChangeInput {
  /** What it did to net worth (+ up, − down). */
  delta: number;
}

/**
 * The month's movement in net worth, per account, grouped (contributions, debt paid
 * down, values entered by hand, cash), largest change first. Accounts that didn't move
 * are left out; the groups and their totals add up to `total`.
 */
export function whatChanged(items: ChangeInput[]) {
  const moved: ChangeItem[] = items
    .map((i) => ({ ...i, delta: cents(i.owed ? i.start - i.end : i.end - i.start) }))
    .filter((i) => Math.abs(i.delta) >= 0.5);
  const groups = CHANGE_GROUPS.map((group) => {
    const rows = moved.filter((i) => i.group === group).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return { group, rows, total: cents(rows.reduce((s, r) => s + r.delta, 0)) };
  }).filter((g) => g.rows.length > 0);
  return { groups, total: cents(moved.reduce((s, r) => s + r.delta, 0)) };
}

/**
 * A typed value ("18.920", "18920,50", "€ 9.500", "1234.5") as a number, or null when
 * it isn't one. A comma is the decimal mark; dots in groups of three are thousands.
 */
export function parseValueInput(text: string): number | null {
  const s = text.replace(/[€\s]/g, "");
  if (!s) return null;
  let normalised: string;
  if (s.includes(",")) normalised = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) normalised = s.replace(/\./g, "");
  else normalised = s;
  if (!/^-?\d+(\.\d+)?$/.test(normalised)) return null;
  const n = Number(normalised);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

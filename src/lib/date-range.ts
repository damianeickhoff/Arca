export type DateRange = { from: string; to: string };
export type FinancialMonthConfig = {
  defaultStartDay: number;
  overrides?: Record<string, number>;
  /** If the computed start date falls on a Saturday/Sunday, roll it back to the preceding Friday. */
  weekendRollback?: boolean;
};

function firstOfMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}
function lastOfMonth(date = new Date()) {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return toDateString(last);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateString(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizeStartDay(value: number | undefined) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 28) return 1;
  return value;
}

function normalizeFinancialMonthConfig(input: number | FinancialMonthConfig | undefined): Required<FinancialMonthConfig> {
  if (typeof input === "number") {
    return { defaultStartDay: normalizeStartDay(input), overrides: {}, weekendRollback: false };
  }
  return {
    defaultStartDay: normalizeStartDay(input?.defaultStartDay),
    overrides: input?.overrides ?? {},
    weekendRollback: input?.weekendRollback ?? false,
  };
}

/** If `date` falls on a Saturday/Sunday, roll it back to the preceding Friday. */
function rollBackWeekend(date: string, enabled: boolean) {
  if (!enabled) return date;
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  const dow = d.getDay(); // 0 = Sunday, 6 = Saturday
  if (dow === 6) d.setDate(d.getDate() - 1);
  else if (dow === 0) d.setDate(d.getDate() - 2);
  return toDateString(d);
}

export function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return toDateString(new Date(year, month - 1, day + days));
}

export function offsetFinancialMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function getFinancialMonthStartDay(month: string, config: number | FinancialMonthConfig = 1) {
  const normalized = normalizeFinancialMonthConfig(config);
  return normalizeStartDay(normalized.overrides[month] ?? normalized.defaultStartDay);
}

export function financialMonthRangeByMonth(month: string, config: number | FinancialMonthConfig = 1): DateRange {
  const normalized = normalizeFinancialMonthConfig(config);
  const from = rollBackWeekend(`${month}-${pad(getFinancialMonthStartDay(month, config))}`, normalized.weekendRollback);
  const nextMonth = offsetFinancialMonth(month, 1);
  const nextFrom = rollBackWeekend(`${nextMonth}-${pad(getFinancialMonthStartDay(nextMonth, config))}`, normalized.weekendRollback);
  const to = shiftDate(nextFrom, -1);
  return { from, to };
}

export function financialMonthForDate(date: string, config: number | FinancialMonthConfig = 1) {
  const month = date.slice(0, 7);
  const monthStart = financialMonthRangeByMonth(month, config).from;
  return date >= monthStart ? month : offsetFinancialMonth(month, -1);
}

export function currentFinancialMonth(config: number | FinancialMonthConfig = 1, now = new Date()) {
  return financialMonthForDate(toDateString(now), config);
}

export function financialMonthRange(config: number | FinancialMonthConfig = 1, offset = 0): DateRange {
  const month = offsetFinancialMonth(currentFinancialMonth(config), offset);
  return financialMonthRangeByMonth(month, config);
}

/** How far into a [from,to] date range "today" is, as 0-100 — 0 before it starts,
 * 100 once it's over. Used to place the small "you are here" marker on progress
 * rings (dashboard spending-by-category cards, category detail budget ring). */
export function periodElapsedPct(from: string, to: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const elapsedDays = Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1;
  if (totalDays <= 0) return 0;
  return Math.max(0, Math.min(100, (elapsedDays / totalDays) * 100));
}

/** Every calendar month (YYYY-MM) covered by [from,to], oldest first. */
export function monthsInRange(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const months: string[] = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= endMonth) {
    months.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}`);
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return months;
}

/** Same-length window of calendar months immediately preceding `months` — the
 * comparison-only window "vs prior period" figures get computed against. */
export function precedingMonths(months: string[]): string[] {
  const n = months.length;
  const first = new Date(`${months[0]}-01T00:00:00`);
  const prev: string[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(first.getFullYear(), first.getMonth() - i, 1);
    prev.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  return prev;
}

/** Extract from/to from searchParams, with fallback to the current financial month. */
export function getDateRange(
  sp: Record<string, string | undefined>,
  config: number | FinancialMonthConfig = 1,
): DateRange {
  const now = new Date();
  if (sp.from && sp.to) return { from: sp.from, to: sp.to };
  // Legacy month param — use the month's real last day, not a bare "-31" (which only
  // happened to work because dates are compared as strings).
  if (sp.month) {
    const [y, m] = sp.month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return { from: `${sp.month}-01`, to: `${sp.month}-${pad(lastDay)}` };
  }
  const normalized = normalizeFinancialMonthConfig(config);
  if (normalized.defaultStartDay > 1 || Object.keys(normalized.overrides).length > 0 || normalized.weekendRollback) {
    return financialMonthRange(normalized);
  }
  return { from: firstOfMonth(now), to: lastOfMonth(now) };
}

import type { NotificationKind } from "@/lib/notification-kinds";

// Which notices are due, given what the app knows today. Pure: the hourly job in
// src/lib/notifications.ts gathers the inputs from the database, runs these rules and
// writes what comes back (skipping a subject it already wrote). Every notice carries a
// `subject` naming what it is about, so the same bill occurrence, month, connection day
// or version is only ever announced once.
//
// Params are stored as JSON and rendered at read time (src/lib/notification-text.ts):
// `amount` and `threshold` render as money, `date` as a short date, everything else as is.

export interface BillInput {
  itemId: number;
  name: string;
  amount: number;
  /** YYYY-MM-DD */
  dueDate: string;
  /** null = unknown (nothing to match it by), false = known unpaid. */
  paid: boolean | null;
  skipped: boolean;
}

export interface ForecastInput {
  /** The financial month (YYYY-MM) the forecast was made in. */
  month: string;
  /** The projected low point is under the warning threshold (or past what the accounts allow). */
  dipped: boolean;
  lowest: { amount: number; date: string } | null;
  threshold: number;
}

/** Remembered between runs: which dip of the month was announced last, and whether the
 *  forecast was still under the line at the last run. */
export interface ForecastState {
  month: string;
  episode: number;
  dipped: boolean;
}

export interface PaydayInput {
  month: string;
  /** The date the main income of this financial month came in, or null while it hasn't. */
  landedOn: string | null;
  /** Safe to spend right now; null without a budget. */
  safeToSpend: number | null;
}

export interface ConnectionInput {
  id: number;
  name: string;
  /** ISO timestamp the bank's consent ends. */
  validUntil: string;
  expired: boolean;
  /** The last sync's error code, null when it went through. */
  lastError: string | null;
  /** ISO timestamp of the last sync attempt. */
  lastAt: string | null;
}

export interface ImportInput {
  /** New transactions a CSV import or bank sync brought in today. */
  count: number;
  /** How many of them still wait for a category. */
  waiting: number;
}

export interface UpdateInput {
  enabled: boolean;
  available: boolean;
  version: string | null;
}

export interface RuleInputs {
  /** YYYY-MM-DD, local. */
  today: string;
  bills: readonly BillInput[];
  forecast: ForecastInput | null;
  forecastState: ForecastState | null;
  payday: PaydayInput | null;
  connections: readonly ConnectionInput[];
  imports: ImportInput | null;
  update: UpdateInput | null;
}

export type NoticeParams = Record<string, string | number>;

export interface NoticeDraft {
  kind: NotificationKind;
  subject: string;
  params: NoticeParams;
  href: string;
  /** Rewrite today's notice of this subject when it changed (importDone grows during the day). */
  replace?: boolean;
}

/** How many days before its due date a bill is announced. */
export const BILL_DUE_SOON_DAYS = 3;
/** A bill past its date is announced from the day after, for up to this many days. */
export const BILL_OVERDUE_WINDOW_DAYS = 7;
/** How many days before a bank's consent ends it is announced. */
export const CONSENT_WARNING_DAYS = 7;
/** A payday found by a late sync still gets its check-in for this many days. */
const PAYDAY_GRACE_DAYS = 2;

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** The local calendar date of an ISO timestamp (a bare date is returned as is). */
export function localDateOf(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const UPCOMING_HREF = "/transactions/upcoming";
const IMPORT_HREF = "/settings?panel=import";

export function billNotices(today: string, bills: readonly BillInput[]): NoticeDraft[] {
  const out: NoticeDraft[] = [];
  for (const bill of bills) {
    if (bill.skipped || bill.paid === true) continue;
    const days = daysBetween(today, bill.dueDate);
    const params = { name: bill.name, amount: bill.amount, date: bill.dueDate };
    const subject = `${bill.itemId}:${bill.dueDate}`;
    if (days >= 1 && days <= BILL_DUE_SOON_DAYS) {
      out.push({ kind: "billDueSoon", subject, params: { ...params, days }, href: UPCOMING_HREF });
    } else if (bill.paid === false && -days >= 1 && -days <= BILL_OVERDUE_WINDOW_DAYS) {
      // Only a known-unpaid bill is overdue; one Arca can't match is never called late.
      out.push({ kind: "billOverdue", subject, params, href: UPCOMING_HREF });
    }
  }
  return out;
}

/**
 * One notice per dip under the line within a financial month: a forecast that stays
 * under it stays quiet, one that recovers and dips again is announced again.
 */
export function forecastNotice(
  forecast: ForecastInput | null,
  state: ForecastState | null,
): { notice: NoticeDraft | null; state: ForecastState | null } {
  if (!forecast) return { notice: null, state };
  const prev = state && state.month === forecast.month ? state : { month: forecast.month, episode: 0, dipped: false };
  if (!forecast.dipped) return { notice: null, state: { ...prev, dipped: false } };
  if (prev.dipped) return { notice: null, state: prev };
  const episode = prev.episode + 1;
  const params: NoticeParams = { threshold: forecast.threshold };
  if (forecast.lowest) {
    params.amount = forecast.lowest.amount;
    params.date = forecast.lowest.date;
  }
  return {
    notice: { kind: "forecastShortfall", subject: `${forecast.month}#${episode}`, params, href: "/forecast" },
    state: { month: forecast.month, episode, dipped: true },
  };
}

export function paydayNotice(today: string, payday: PaydayInput | null): NoticeDraft | null {
  if (!payday?.landedOn || payday.safeToSpend == null) return null;
  const since = daysBetween(payday.landedOn, today);
  if (since < 0 || since > PAYDAY_GRACE_DAYS) return null;
  return { kind: "paydayCheckIn", subject: payday.month, params: { amount: payday.safeToSpend }, href: "/" };
}

export function connectionNotices(today: string, connections: readonly ConnectionInput[]): NoticeDraft[] {
  const out: NoticeDraft[] = [];
  for (const c of connections) {
    const until = localDateOf(c.validUntil);
    const days = daysBetween(today, until);
    if (!c.expired && days >= 0 && days <= CONSENT_WARNING_DAYS) {
      out.push({ kind: "bankConsentExpiring", subject: `${c.id}:${until}`, params: { bank: c.name, date: until, days }, href: IMPORT_HREF });
    }
    // "busy" only means another import was running; the next run tries again.
    if (c.lastError && c.lastError !== "busy" && c.lastAt && localDateOf(c.lastAt) === today) {
      out.push({ kind: "bankSyncFailed", subject: `${c.id}:${today}`, params: { bank: c.name }, href: IMPORT_HREF });
    }
  }
  return out;
}

/** Today's imports in one notice that grows with every import of the day. */
export function importNotice(today: string, imports: ImportInput | null): NoticeDraft | null {
  if (!imports || imports.count <= 0) return null;
  const waiting = Math.min(imports.waiting, imports.count);
  return {
    kind: "importDone",
    subject: today,
    params: { count: imports.count, waiting },
    href: waiting > 0 ? "/transactions/needs-review" : "/transactions",
    replace: true,
  };
}

export function updateNotice(update: UpdateInput | null): NoticeDraft | null {
  if (!update?.enabled || !update.available || !update.version) return null;
  return { kind: "updateAvailable", subject: update.version, params: { version: update.version }, href: "/settings?panel=about" };
}

/** Every notice due today, and the forecast state to remember for the next run. */
export function dueNotices(input: RuleInputs): { notices: NoticeDraft[]; forecastState: ForecastState | null } {
  const forecast = forecastNotice(input.forecast, input.forecastState);
  const notices = [
    ...billNotices(input.today, input.bills),
    forecast.notice,
    paydayNotice(input.today, input.payday),
    ...connectionNotices(input.today, input.connections),
    importNotice(input.today, input.imports),
    updateNotice(input.update),
  ].filter((n): n is NoticeDraft => n != null);
  return { notices, forecastState: forecast.state };
}

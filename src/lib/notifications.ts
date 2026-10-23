import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, appSettings, notifications, transactions, users, type NotificationRow } from "@/db/schema";
import { getBudgetRecurringMode, getDefaultCurrency, getFinancialMonthConfig } from "@/lib/app-settings";
import { getBillStatuses, UPCOMING_TYPES, type BillStatus } from "@/lib/bill-status";
import { getBudgetOverview } from "@/lib/budget-overview";
import { getCashFlowForecast } from "@/lib/cash-flow-forecast";
import { currentFinancialMonth, financialMonthRangeByMonth, offsetFinancialMonth, todayStr, type FinancialMonthConfig } from "@/lib/date-range";
import { listBankConnections } from "@/lib/bank-sync";
import { getNeedsReviewTransactions } from "@/lib/needs-review";
import { safeToSpend } from "@/lib/safe-to-spend";
import { getUpdateCheckState } from "@/lib/update-check";
import { setCurrentCurrency } from "@/lib/format";
import { NOTIFICATION_KINDS, notificationKeys, parseDisabledKinds, type NotificationKind, type NotificationView } from "@/lib/notification-kinds";
import { dueNotices, localDateOf, type BillInput, type ForecastState, type NoticeDraft, type RuleInputs } from "@/lib/notification-rules";
import { renderNotice } from "@/lib/notification-text";
import { sendPush } from "@/lib/push";

// The notification job: gathers today's inputs, asks the pure rules in
// notification-rules.ts which notices are due, writes the new ones for every user who
// has that kind switched on, and pushes them to the user's devices. Runs every hour from
// src/instrumentation.ts (startNotificationScheduler) and straight after a CSV import or
// a bank sync (so "N new transactions" arrives at once). Best effort: never throws.

const FORECAST_STATE_KEY = "notify_forecast_state";
const disabledKey = (userId: number) => `notify_off_${userId}`;

const CHECK_EVERY_MS = 60 * 60 * 1000;
const FIRST_CHECK_MS = 2 * 60 * 1000;

/** The "income" recurring types in bill statuses. */
const EXPENSE_TYPES = ["bill", "subscription", "debt", "plan", "savings"];

async function readSetting(key: string): Promise<string | null> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row?.value ?? null;
}

async function writeSetting(key: string, value: string) {
  await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

// ─── Per-user switches ───────────────────────────────────────────────────────

export async function getDisabledKinds(userId: number): Promise<NotificationKind[]> {
  return parseDisabledKinds(await readSetting(disabledKey(userId)));
}

export async function setKindEnabled(userId: number, kind: NotificationKind, enabled: boolean) {
  const off = new Set(await getDisabledKinds(userId));
  if (enabled) off.delete(kind);
  else off.add(kind);
  await writeSetting(disabledKey(userId), JSON.stringify(NOTIFICATION_KINDS.filter((k) => off.has(k))));
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

function billInputs(statuses: BillStatus[]): BillInput[] {
  return statuses
    .filter((s) => s.dueDate != null && EXPENSE_TYPES.includes(s.item.type))
    .map((s) => ({
      itemId: s.item.id,
      name: s.item.friendlyName ?? s.item.name,
      amount: s.item.amount ?? 0,
      dueDate: s.dueDate!,
      paid: s.paid,
      skipped: s.skipped,
    }));
}

/** The main income of the month: the largest income item, and the day it came in. */
async function paydayInput(month: string, financialMonth: FinancialMonthConfig, statuses: BillStatus[], today: string): Promise<RuleInputs["payday"]> {
  const income = statuses.filter((s) => s.item.type === "income").sort((a, z) => (z.item.amount ?? 0) - (a.item.amount ?? 0))[0];
  if (!income) return null;
  let landedOn: string | null = null;
  if (income.paid === true) {
    const { from, to } = financialMonthRangeByMonth(month, financialMonth);
    const [linked] = await db
      .select({ date: sql<string>`min(${transactions.date})` })
      .from(transactions)
      .where(and(eq(transactions.recurringItemId, income.item.id), eq(transactions.direction, "income"), sql`${transactions.date} BETWEEN ${from} AND ${to}`));
    // Matched by its pattern without a link (or marked paid by hand): it landed by now.
    landedOn = linked?.date ?? today;
  }
  if (!landedOn) return { month, landedOn: null, safeToSpend: null };

  const [overview, recurringMode] = await Promise.all([getBudgetOverview(financialMonth), getBudgetRecurringMode()]);
  const upcoming = statuses.filter((s) => s.dueDate != null && s.paid !== true);
  const figures = safeToSpend(
    overview,
    upcoming.map((s) => ({ categoryId: s.item.categoryId, amount: s.item.amount ?? 0, dueDate: s.dueDate!, isIncome: s.item.type === "income" })),
    recurringMode,
    today,
  );
  return { month, landedOn, safeToSpend: figures ? Math.round(figures.amount * 100) / 100 : null };
}

/** New transactions today's imports and syncs brought in, and how many still wait for a category. */
async function importInput(today: string): Promise<RuleInputs["imports"]> {
  const entries = await db
    .select({ at: activityLog.at, refs: activityLog.refs })
    .from(activityLog)
    .where(and(inArray(activityLog.kind, ["csvImport", "bankSync"]), isNull(activityLog.undoneAt), sql`${activityLog.at} >= datetime('now', '-2 days')`));
  const ids = new Set<number>();
  for (const e of entries) {
    // activity_log.at is SQLite's UTC datetime('now').
    if (localDateOf(`${e.at.replace(" ", "T")}Z`) !== today) continue;
    try {
      const refs = JSON.parse(e.refs ?? "{}") as { transactions?: number[] };
      for (const id of refs.transactions ?? []) ids.add(id);
    } catch {
      /* an unreadable entry adds nothing */
    }
  }
  if (ids.size === 0) return null;
  // Rows that were deleted since no longer count.
  const still = new Set<number>();
  const list = [...ids];
  for (let i = 0; i < list.length; i += 500) {
    for (const r of await db.select({ id: transactions.id }).from(transactions).where(inArray(transactions.id, list.slice(i, i + 500)))) still.add(r.id);
  }
  const waiting = (await getNeedsReviewTransactions()).filter((t) => still.has(t.id)).length;
  return { count: still.size, waiting };
}

async function gatherInputs(): Promise<RuleInputs> {
  const today = todayStr();
  const financialMonth = await getFinancialMonthConfig();
  const month = currentFinancialMonth(financialMonth);
  const [current, next, forecast, forecastState, connections, imports, update] = await Promise.all([
    getBillStatuses(month, financialMonth, UPCOMING_TYPES),
    // A bill due early next financial month is "due soon" at the end of this one.
    getBillStatuses(offsetFinancialMonth(month, 1), financialMonth),
    getCashFlowForecast(financialMonth).catch(() => null),
    readSetting(FORECAST_STATE_KEY),
    listBankConnections(),
    importInput(today),
    getUpdateCheckState(),
  ]);
  const payday = await paydayInput(month, financialMonth, current, today);

  let state: ForecastState | null = null;
  try {
    state = forecastState ? (JSON.parse(forecastState) as ForecastState) : null;
  } catch {
    state = null;
  }

  return {
    today,
    bills: billInputs([...current, ...next]),
    forecast:
      forecast && forecast.status !== "empty"
        ? { month, dipped: forecast.status !== "healthy", lowest: forecast.lowest, threshold: forecast.warningThreshold }
        : null,
    forecastState: state,
    payday,
    connections: connections.map((c) => ({
      id: c.id,
      name: c.aspspName,
      validUntil: c.validUntil,
      expired: c.expired,
      lastError: c.lastResult?.error ?? null,
      lastAt: c.lastResult?.at ?? null,
    })),
    imports,
    update: { enabled: update.enabled, available: update.available, version: update.latest?.version ?? null },
  };
}

// ─── Writing ─────────────────────────────────────────────────────────────────

/**
 * Writes one notice for one user. Returns the row when it is new (or, for a notice that
 * replaces today's, when it changed), null when it was already there. A subject is only
 * ever announced once; the unique index on (user, kind, subject, day) is the hard stop
 * for two runs at the same moment.
 */
export async function writeNotice(userId: number, draft: NoticeDraft, today: string): Promise<NotificationRow | null> {
  const keys = notificationKeys(draft.kind);
  const params = JSON.stringify(draft.params);
  const [existing] = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.kind, draft.kind), eq(notifications.subject, draft.subject)))
    .orderBy(desc(notifications.id))
    .limit(1);
  if (existing) {
    if (!draft.replace || existing.day !== today || (existing.params === params && existing.href === draft.href)) return null;
    const [updated] = await db
      .update(notifications)
      .set({ params, href: draft.href, readAt: null, createdAt: sql`(datetime('now'))` })
      .where(eq(notifications.id, existing.id))
      .returning();
    return updated ?? null;
  }
  const [row] = await db
    .insert(notifications)
    .values({ userId, kind: draft.kind, subject: draft.subject, day: today, title: keys.title, body: keys.body, params, href: draft.href })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

/** Writes every due notice for every user with that kind on; returns what is new. */
export async function writeDueNotices(drafts: readonly NoticeDraft[], today: string): Promise<NotificationRow[]> {
  const people = await db.select({ id: users.id }).from(users).where(eq(users.onboardingComplete, true));
  const written: NotificationRow[] = [];
  for (const { id } of people) {
    const off = new Set(await getDisabledKinds(id));
    for (const draft of drafts) {
      if (off.has(draft.kind)) continue;
      const row = await writeNotice(id, draft, today);
      if (row) written.push(row);
    }
  }
  return written;
}

/** Pushes a written notice to the user's devices, each in its own language. */
export function pushNotice(row: NotificationRow) {
  return sendPush(row.userId, (locale) => {
    const text = renderNotice(row, locale);
    return { title: text.title, body: text.body, href: row.href ?? "/notifications", id: row.id };
  });
}

const jobState = globalThis as typeof globalThis & { __arcaNotifyRunning?: boolean; __arcaNotifyAgain?: boolean; __arcaNotifyScheduler?: boolean };

/**
 * One run of the checks. A call while one runs (an import finishing mid-run) makes the
 * running one go round once more, so nothing is missed and nothing runs twice at once.
 */
export async function runNotificationChecks(): Promise<void> {
  if (jobState.__arcaNotifyRunning) {
    jobState.__arcaNotifyAgain = true;
    return;
  }
  jobState.__arcaNotifyRunning = true;
  try {
    do {
      jobState.__arcaNotifyAgain = false;
      try {
        // Money in the texts uses the app's currency; the job runs outside any request.
        setCurrentCurrency(await getDefaultCurrency());
        const inputs = await gatherInputs();
        const { notices, forecastState } = dueNotices(inputs);
        if (forecastState) await writeSetting(FORECAST_STATE_KEY, JSON.stringify(forecastState));
        const written = await writeDueNotices(notices, inputs.today);
        for (const row of written) void pushNotice(row);
      } catch (e) {
        console.warn("[notifications] check failed:", e);
      }
    } while (jobState.__arcaNotifyAgain);
  } finally {
    jobState.__arcaNotifyRunning = false;
  }
}

/** Started once per server process from src/instrumentation.ts, beside the bank scheduler. */
export function startNotificationScheduler() {
  if (jobState.__arcaNotifyScheduler) return;
  jobState.__arcaNotifyScheduler = true;
  setTimeout(() => void runNotificationChecks(), FIRST_CHECK_MS).unref();
  setInterval(() => void runNotificationChecks(), CHECK_EVERY_MS).unref();
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export const NOTIFICATION_PAGE_SIZE = 30;

function toIso(sqliteUtc: string) {
  return sqliteUtc.includes("T") ? sqliteUtc : `${sqliteUtc.replace(" ", "T")}Z`;
}

/** The user's notices, newest first, rendered in `locale`; `offset` pages to older ones. */
export async function listNotifications(userId: number, locale: string, opts: { offset?: number; limit?: number } = {}) {
  const limit = opts.limit ?? NOTIFICATION_PAGE_SIZE;
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    // A replaced notice moves to the top with its new time.
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1)
    .offset(Math.max(0, opts.offset ?? 0));
  const items: NotificationView[] = rows.slice(0, limit).map((r) => ({
    id: r.id,
    kind: r.kind as NotificationKind,
    ...renderNotice(r, locale),
    href: r.href,
    createdAt: toIso(r.createdAt),
    read: r.readAt != null,
  }));
  return { items, hasMore: rows.length > limit };
}

export async function countUnreadNotifications(userId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.n ?? 0);
}

export async function markNotificationRead(userId: number, id: number) {
  await db
    .update(notifications)
    .set({ readAt: sql`(datetime('now'))` })
    .where(and(eq(notifications.userId, userId), eq(notifications.id, id), isNull(notifications.readAt)));
}

export async function markAllNotificationsRead(userId: number) {
  await db.update(notifications).set({ readAt: sql`(datetime('now'))` }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}


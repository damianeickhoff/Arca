import { randomBytes } from "node:crypto";
import { and, asc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, bankConnectionAccounts, bankConnections, banks, transactions, type BankConnection } from "@/db/schema";
import {
  ebRequest,
  type BankApiError,
  type BankApiResult,
  type EbAspsp,
  type EbSession,
  type EbSessionAccount,
} from "@/lib/enable-banking/client";
import { mapEnableBankingTransaction, splitAlreadyImported, syncDateFrom, type EbTransaction } from "@/lib/enable-banking/map";
import type { ParsedRow } from "@/lib/bank-parsers";
import { importParsedRows } from "@/lib/import-rows";
import { isImportRunning } from "@/lib/import-lock";
import { normalizeAccountNumber } from "@/lib/internal-transfers";

// The bank connection: connecting a bank (consent → session → accounts), linking its
// accounts to Centje's, and syncing their transactions through the CSV import path
// (importParsedRows), so dedupe, merchants, rules and Needs review behave as for a file.

/** The callback path the Enable Banking app has whitelisted (docs/enable-banking-setup.md). */
export const CALLBACK_PATH = "/api/bank/callback";

/** Consent is valid for at most 180 days in the EU; the bank may allow less. */
const MAX_CONSENT_SECONDS = 180 * 24 * 3600;
const DEFAULT_CONSENT_SECONDS = 90 * 24 * 3600;

/** A started consent waits this long for the browser to come back. */
const PENDING_AUTH_TTL_MS = 30 * 60 * 1000;
const PENDING_KEY = "eb_pending_auth";

// ─── Banks to choose from ─────────────────────────────────────────────────────

export interface AspspOption {
  name: string;
  country: string;
  logo: string | null;
  maxConsentSeconds: number | null;
  beta: boolean;
}

export async function listAspsps(country = "NL"): Promise<{ ok: true; banks: AspspOption[] } | { ok: false; error: BankApiError }> {
  const result = await ebRequest<{ aspsps: EbAspsp[] }>("GET", "/aspsps", { query: { country, psu_type: "personal", service: "AIS" } });
  if (!result.ok) return result;
  const options = (result.value.aspsps ?? [])
    .map((a) => ({
      name: a.name,
      country: a.country,
      logo: a.logo ?? null,
      maxConsentSeconds: typeof a.maximum_consent_validity === "number" ? a.maximum_consent_validity : null,
      beta: a.beta === true,
    }))
    .sort((a, z) => a.name.localeCompare(z.name));
  return { ok: true, banks: options };
}

// ─── Consent ──────────────────────────────────────────────────────────────────

interface PendingAuth {
  state: string;
  aspsp: { name: string; country: string };
  origin: string;
  createdAt: number;
}

async function readPending(): Promise<PendingAuth[]> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, PENDING_KEY)).limit(1);
  try {
    const list = JSON.parse(row?.value ?? "[]") as PendingAuth[];
    return Array.isArray(list) ? list.filter((p) => Date.now() - p.createdAt < PENDING_AUTH_TTL_MS) : [];
  } catch {
    return [];
  }
}

async function writePending(list: PendingAuth[]) {
  const value = JSON.stringify(list);
  await db.insert(appSettings).values({ key: PENDING_KEY, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

/** How long to ask the bank for: what it allows, capped at 180 days. Pure. */
export function consentSeconds(maxConsentSeconds: number | null | undefined): number {
  if (typeof maxConsentSeconds !== "number" || !Number.isFinite(maxConsentSeconds) || maxConsentSeconds <= 0) return DEFAULT_CONSENT_SECONDS;
  return Math.min(maxConsentSeconds, MAX_CONSENT_SECONDS);
}

/**
 * Starts a consent at `aspsp`: a state nonce is kept server-side and the bank's
 * consent page URL comes back for the browser to open. `origin` is the address the
 * user opened Centje at, so the bank returns them to the same place (localhost, a LAN
 * address or the https domain — whichever is whitelisted on the app).
 */
export async function startBankAuth(
  aspsp: { name: string; country: string; maxConsentSeconds: number | null },
  origin: string,
): Promise<{ ok: true; url: string } | { ok: false; error: BankApiError }> {
  const state = randomBytes(24).toString("base64url");
  const validUntil = new Date(Date.now() + consentSeconds(aspsp.maxConsentSeconds) * 1000).toISOString();
  const result = await ebRequest<{ url: string }>("POST", "/auth", {
    body: {
      access: { valid_until: validUntil },
      aspsp: { name: aspsp.name, country: aspsp.country },
      state,
      redirect_url: `${origin}${CALLBACK_PATH}`,
      psu_type: "personal",
    },
  });
  if (!result.ok) return result;
  const pending = await readPending();
  await writePending([...pending, { state, aspsp: { name: aspsp.name, country: aspsp.country }, origin, createdAt: Date.now() }]);
  return { ok: true, url: result.value.url };
}

function accountIban(account: EbSessionAccount): string | null {
  return normalizeAccountNumber(account.account_id?.iban ?? account.account_id?.other?.identification ?? null);
}

export type CallbackOutcome =
  | { ok: true; connectionId: number; origin: string }
  | { ok: false; error: "unknownState" | "denied" | BankApiError; origin: string | null };

/**
 * The browser is back from the bank with `code` (or `error`) and our `state`: exchange
 * the code for a session, store it and its accounts, and link every account whose IBAN
 * is already one of Centje's. A reconnect to the same bank replaces the old connection,
 * keeping each account's link and last synced date.
 */
export async function completeBankAuth(params: { state: string | null; code: string | null; error: string | null }): Promise<CallbackOutcome> {
  const pending = await readPending();
  const match = params.state ? pending.find((p) => p.state === params.state) : undefined;
  if (!match) return { ok: false, error: "unknownState", origin: null };
  await writePending(pending.filter((p) => p.state !== match.state));
  if (params.error || !params.code) return { ok: false, error: "denied", origin: match.origin };

  const result = await ebRequest<EbSession>("POST", "/sessions", { body: { code: params.code } });
  if (!result.ok) return { ok: false, error: result.error, origin: match.origin };
  const session = result.value;

  const previous = await db
    .select({ connection: bankConnections, account: bankConnectionAccounts })
    .from(bankConnections)
    .leftJoin(bankConnectionAccounts, eq(bankConnectionAccounts.connectionId, bankConnections.id))
    .where(and(eq(bankConnections.aspspName, session.aspsp.name), eq(bankConnections.aspspCountry, session.aspsp.country)));
  const previousByIban = new Map(
    previous.filter((p) => p.account?.iban).map((p) => [p.account!.iban!, p.account!]),
  );

  const allBanks = await db.select({ id: banks.id, accountNumber: banks.accountNumber }).from(banks);
  const bankByIban = new Map(allBanks.filter((b) => b.accountNumber).map((b) => [normalizeAccountNumber(b.accountNumber)!, b.id]));

  const [connection] = await db
    .insert(bankConnections)
    .values({
      aspspName: session.aspsp.name,
      aspspCountry: session.aspsp.country,
      sessionId: session.session_id,
      validUntil: session.access.valid_until,
      status: "active",
    })
    .returning({ id: bankConnections.id });

  for (const account of session.accounts ?? []) {
    const iban = accountIban(account);
    const before = iban ? previousByIban.get(iban) : undefined;
    const autoBank = iban ? bankByIban.get(iban) ?? null : null;
    await db.insert(bankConnectionAccounts).values({
      connectionId: connection.id,
      accountUid: account.uid,
      iban,
      name: account.name?.trim() || account.product?.trim() || account.details?.trim() || null,
      currency: account.currency ?? null,
      bankId: before ? before.bankId : autoBank,
      mapped: before ? before.mapped : false,
      lastSyncedDate: before?.lastSyncedDate ?? null,
    }).onConflictDoNothing();
  }

  // The old connection(s) to this bank are replaced; closing them at the bank is a courtesy.
  const oldSessions = new Map(previous.map((p) => [p.connection.id, p.connection.sessionId]));
  for (const sessionId of oldSessions.values()) void ebRequest("DELETE", `/sessions/${encodeURIComponent(sessionId)}`);
  if (oldSessions.size > 0) await db.delete(bankConnections).where(inArray(bankConnections.id, [...oldSessions.keys()]));

  return { ok: true, connectionId: connection.id, origin: match.origin };
}

// ─── Connections and their accounts ──────────────────────────────────────────

export interface BankSyncSummary {
  imported: number;
  alreadyThere: number;
  /** ISO timestamp. */
  at: string;
  error?: BankSyncError;
}

export type BankSyncError = BankApiError | "busy" | "expired";

export interface ConnectedAccountView {
  id: number;
  iban: string | null;
  name: string | null;
  currency: string | null;
  bankId: number | null;
  bankName: string | null;
  mapped: boolean;
  lastSyncedDate: string | null;
}

export interface BankConnectionView {
  id: number;
  aspspName: string;
  aspspCountry: string;
  validUntil: string;
  /** True once the consent ran out (by date or by the bank's word): reconnect to renew. */
  expired: boolean;
  lastSyncedAt: string | null;
  lastResult: BankSyncSummary | null;
  accounts: ConnectedAccountView[];
}

function isExpired(connection: Pick<BankConnection, "status" | "validUntil">, now = Date.now()): boolean {
  return connection.status === "expired" || new Date(connection.validUntil).getTime() <= now;
}

function parseSummary(value: string | null): BankSyncSummary | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as BankSyncSummary;
  } catch {
    return null;
  }
}

export async function listBankConnections(): Promise<BankConnectionView[]> {
  const connections = await db.select().from(bankConnections).orderBy(asc(bankConnections.aspspName));
  if (connections.length === 0) return [];
  const accounts = await db
    .select({ account: bankConnectionAccounts, bankName: banks.displayName, bankNumber: banks.accountNumber })
    .from(bankConnectionAccounts)
    .leftJoin(banks, eq(banks.id, bankConnectionAccounts.bankId))
    .where(inArray(bankConnectionAccounts.connectionId, connections.map((c) => c.id)))
    .orderBy(asc(bankConnectionAccounts.id));
  return connections.map((c) => ({
    id: c.id,
    aspspName: c.aspspName,
    aspspCountry: c.aspspCountry,
    validUntil: c.validUntil,
    expired: isExpired(c),
    lastSyncedAt: c.lastSyncedAt,
    lastResult: parseSummary(c.lastResult),
    accounts: accounts
      .filter((a) => a.account.connectionId === c.id)
      .map(({ account, bankName, bankNumber }) => ({
        id: account.id,
        iban: account.iban,
        name: account.name,
        currency: account.currency,
        bankId: account.bankId,
        bankName: account.bankId ? bankName?.trim() || bankNumber || null : null,
        mapped: account.mapped,
        lastSyncedDate: account.lastSyncedDate,
      })),
  }));
}

/** One account's link: an existing bank's id, "new" to add one from the account, or null to skip it. */
export type AccountLinkChoice = number | "new" | null;

/**
 * Saves the account mapping dialog. "new" creates a bank row from the account (its IBAN
 * as the account number, its name as the display name), or reuses one with that IBAN.
 * Linking to a bank without an account number gives it this IBAN, so its rows match; a
 * bank with another number (a custom account's CUSTOM-…) keeps it and the bank's rows
 * are filed under it, next to the ones already there.
 */
export async function saveAccountLinks(connectionId: number, links: { accountId: number; choice: AccountLinkChoice }[]): Promise<void> {
  const accounts = await db.select().from(bankConnectionAccounts).where(eq(bankConnectionAccounts.connectionId, connectionId));
  for (const link of links) {
    const account = accounts.find((a) => a.id === link.accountId);
    if (!account) continue;
    let bankId: number | null = null;
    if (link.choice === "new") {
      if (account.iban) {
        await db.insert(banks).values({ accountNumber: account.iban, displayName: account.name }).onConflictDoNothing();
        const [row] = await db.select({ id: banks.id }).from(banks).where(eq(banks.accountNumber, account.iban)).limit(1);
        bankId = row?.id ?? null;
      } else {
        // No IBAN: the synthetic number custom accounts get (see bank-account-numbers.ts),
        // so its rows still have an account to be filed under.
        const [row] = await db.insert(banks).values({ displayName: account.name }).returning({ id: banks.id });
        await db.update(banks).set({ accountNumber: `CUSTOM-${row.id}` }).where(eq(banks.id, row.id));
        bankId = row.id;
      }
    } else if (typeof link.choice === "number") {
      const [bank] = await db.select().from(banks).where(eq(banks.id, link.choice)).limit(1);
      if (bank) {
        bankId = bank.id;
        if (!bank.accountNumber && account.iban) {
          const [taken] = await db.select({ id: banks.id }).from(banks).where(eq(banks.accountNumber, account.iban)).limit(1);
          if (!taken) await db.update(banks).set({ accountNumber: account.iban }).where(eq(banks.id, bank.id));
        }
      }
    }
    await db.update(bankConnectionAccounts).set({ bankId, mapped: true }).where(eq(bankConnectionAccounts.id, account.id));
  }
}

export async function disconnectBank(connectionId: number): Promise<void> {
  const [connection] = await db.select().from(bankConnections).where(eq(bankConnections.id, connectionId)).limit(1);
  if (!connection) return;
  // Closes the consent at the bank where it can; the rows already imported stay.
  await ebRequest("DELETE", `/sessions/${encodeURIComponent(connection.sessionId)}`);
  await db.delete(bankConnections).where(eq(bankConnections.id, connectionId));
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

const syncState = globalThis as typeof globalThis & { __centjeBankSyncRunning?: boolean };

/** At most this many pages of transactions per account and sync (a page is ~a few hundred rows). */
const MAX_PAGES = 100;

interface EbTransactionPage {
  transactions?: EbTransaction[];
  continuation_key?: string | null;
}

async function fetchBookedTransactions(accountUid: string, dateFrom: string | null): Promise<{ ok: true; rows: EbTransaction[] } | { ok: false; error: BankApiError }> {
  const rows: EbTransaction[] = [];
  let continuationKey: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result: BankApiResult<EbTransactionPage> = await ebRequest<EbTransactionPage>(
      "GET",
      `/accounts/${encodeURIComponent(accountUid)}/transactions`,
      {
        query: {
          transaction_status: "BOOK",
          // The first sync asks for as much history as the bank will give.
          ...(dateFrom ? { date_from: dateFrom } : { strategy: "longest" }),
          continuation_key: continuationKey,
        },
      },
    );
    if (!result.ok) return result;
    rows.push(...(result.value.transactions ?? []).filter((t) => !t.status || t.status === "BOOK"));
    continuationKey = result.value.continuation_key ?? null;
    if (!continuationKey) break;
  }
  return { ok: true, rows };
}

/** Bank rows a CSV import (or a manual entry on the account) already brought in. */
async function dropRowsAlreadyImported(rows: ParsedRow[], accountNumber: string): Promise<{ fresh: ParsedRow[]; present: number }> {
  if (rows.length === 0) return { fresh: [], present: 0 };
  // Rows whose bank hash is stored already are counted by the import itself.
  const hashes = [...new Set(rows.map((r) => r.hash))];
  const known = new Set<string>();
  for (let i = 0; i < hashes.length; i += 500) {
    const found = await db.select({ hash: transactions.importHash }).from(transactions).where(inArray(transactions.importHash, hashes.slice(i, i + 500)));
    for (const f of found) if (f.hash) known.add(f.hash);
  }
  const unknown = rows.filter((r) => !known.has(r.hash));
  if (unknown.length === 0) return { fresh: rows, present: 0 };
  const dates = unknown.map((r) => r.date).sort();
  const existing = await db
    .select({ date: transactions.date, amount: transactions.amount, direction: transactions.direction })
    .from(transactions)
    .where(and(
      eq(transactions.account, accountNumber),
      ne(transactions.source, "bank"),
      gte(transactions.date, dates[0]),
      lte(transactions.date, dates[dates.length - 1]),
    ));
  const { fresh, present } = splitAlreadyImported(unknown, existing);
  return { fresh: [...rows.filter((r) => known.has(r.hash)), ...fresh], present: present.length };
}

async function recordResult(connectionId: number, summary: BankSyncSummary, expired = false) {
  await db
    .update(bankConnections)
    .set({
      lastResult: JSON.stringify(summary),
      ...(summary.error ? {} : { lastSyncedAt: summary.at }),
      ...(expired ? { status: "expired" } : {}),
    })
    .where(eq(bankConnections.id, connectionId));
}

async function syncOne(connection: BankConnection): Promise<BankSyncSummary> {
  const at = new Date().toISOString();
  if (isExpired(connection)) {
    const summary = { imported: 0, alreadyThere: 0, at, error: "expired" as const };
    await recordResult(connection.id, summary, true);
    return summary;
  }
  const accounts = await db
    .select({ account: bankConnectionAccounts, accountNumber: banks.accountNumber })
    .from(bankConnectionAccounts)
    .innerJoin(banks, eq(banks.id, bankConnectionAccounts.bankId))
    .where(eq(bankConnectionAccounts.connectionId, connection.id));

  let imported = 0;
  let alreadyThere = 0;
  for (const { account, accountNumber } of accounts) {
    const iban = account.iban ?? accountNumber ?? account.accountUid;
    const fileUnder = normalizeAccountNumber(accountNumber) ?? normalizeAccountNumber(account.iban);
    if (!fileUnder) continue;

    const fetched = await fetchBookedTransactions(account.accountUid, syncDateFrom(account.lastSyncedDate));
    if (!fetched.ok) {
      const expired = fetched.error === "sessionExpired";
      const summary = { imported, alreadyThere, at, error: expired ? ("expired" as const) : fetched.error };
      await recordResult(connection.id, summary, expired);
      return summary;
    }
    const rows = fetched.rows
      .map((tx) => mapEnableBankingTransaction(tx, { iban, account: fileUnder }))
      .filter((r): r is ParsedRow => r != null);
    const { fresh, present } = await dropRowsAlreadyImported(rows, fileUnder);
    const result = fresh.length > 0 ? await importParsedRows(fresh, { source: "bank" }) : null;
    imported += result?.imported ?? 0;
    alreadyThere += present + (result?.skipped ?? 0);

    const newest = rows.reduce<string | null>((max, r) => (!max || r.date > max ? r.date : max), account.lastSyncedDate);
    await db.update(bankConnectionAccounts).set({ lastSyncedDate: newest ?? at.slice(0, 10) }).where(eq(bankConnectionAccounts.id, account.id));
  }
  const summary = { imported, alreadyThere, at };
  await recordResult(connection.id, summary);
  return summary;
}

export type SyncOutcome =
  | { ok: true; results: { connectionId: number; summary: BankSyncSummary }[] }
  | { ok: false; error: "busy" };

/**
 * Syncs one connection, or all of them. Refuses while a CSV import or another sync is
 * running. An expired consent is recorded on the connection (the panel then asks to
 * reconnect) rather than failing the whole run.
 */
export async function syncBankConnections(connectionId?: number): Promise<SyncOutcome> {
  if (syncState.__centjeBankSyncRunning || isImportRunning()) return { ok: false, error: "busy" };
  syncState.__centjeBankSyncRunning = true;
  try {
    const connections = await db
      .select()
      .from(bankConnections)
      .where(connectionId != null ? eq(bankConnections.id, connectionId) : undefined);
    const results: { connectionId: number; summary: BankSyncSummary }[] = [];
    for (const connection of connections) {
      results.push({ connectionId: connection.id, summary: await syncOne(connection) });
    }
    return { ok: true, results };
  } finally {
    syncState.__centjeBankSyncRunning = false;
  }
}

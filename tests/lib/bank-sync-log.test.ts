// A bank sync against a real, throwaway database (tests/setup.ts) with Enable Banking
// replaced by a stub: every run leaves one change-log entry (Settings › Import › Sync
// log) with the right counts, a failed run leaves a non-reversible one with its error,
// and linking or syncing gives the account the type the bank reports.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateTestDb, clearFixtures, removeTestDb } from "../helpers/test-db";
import type { EbTransaction } from "@/lib/enable-banking/map";

const IBAN = "LT123250012345678901";

/** What the stubbed API answers, by path. */
const api: { transactions: () => unknown; details: () => unknown } = {
  transactions: () => ({ ok: true, value: { transactions: [] } }),
  details: () => ({ ok: true, value: { cash_account_type: "CACC" } }),
};

vi.mock("@/lib/enable-banking/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/enable-banking/client")>();
  return {
    ...real,
    ebRequest: vi.fn(async (_method: string, path: string) => {
      if (path.endsWith("/transactions")) return api.transactions();
      if (path.endsWith("/details")) return api.details();
      return { ok: true, value: {} };
    }),
  };
});

const tx = (ref: string, amount: string): EbTransaction => ({
  entry_reference: ref,
  booking_date: "2026-10-14",
  value_date: "2026-10-14",
  transaction_amount: { amount, currency: "EUR" },
  credit_debit_indicator: "DBIT",
  status: "BOOK",
  creditor: { name: `Shop ${ref}` },
  debtor_account: { iban: IBAN },
  remittance_information: [`Card payment ${ref}`],
});

beforeAll(() => migrateTestDb());
afterAll(() => removeTestDb());

async function setup(opts: { cardType?: string | null; validUntil?: string } = {}) {
  await clearFixtures();
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const { sql } = await import("drizzle-orm");
  db.run(sql.raw("DELETE FROM activity_log"));
  db.run(sql.raw("DELETE FROM bank_connections"));
  const [bank] = await db.insert(s.banks).values({ accountNumber: IBAN, displayName: "Revolut", cardType: opts.cardType ?? null }).returning();
  const [connection] = await db
    .insert(s.bankConnections)
    .values({ aspspName: "Revolut", aspspCountry: "LT", sessionId: "sess-1", validUntil: opts.validUntil ?? "2099-01-01T00:00:00Z", status: "active" })
    .returning();
  const [account] = await db
    .insert(s.bankConnectionAccounts)
    .values({ connectionId: connection.id, accountUid: "uid-1", iban: IBAN, name: "Johan", bankId: bank.id, mapped: true })
    .returning();
  return { db, s, bank, connection, account };
}

async function bankSyncEntries() {
  const { listActivity } = await import("@/lib/activity-log");
  return listActivity(50).filter((a) => a.kind === "bankSync");
}

describe("bank sync change log", () => {
  beforeEach(() => {
    api.transactions = () => ({ ok: true, value: { transactions: [tx("a1", "12.50"), tx("a2", "3.20")] } });
    api.details = () => ({ ok: true, value: { cash_account_type: "CACC" } });
  });

  it("records an entry per run with the inserted and already-there counts, and undo reverses it", async () => {
    const { db, s, connection } = await setup();
    const { syncBankConnections } = await import("@/lib/bank-sync");
    const { undoActivity } = await import("@/lib/activity-log");

    const first = await syncBankConnections(connection.id);
    expect(first).toMatchObject({ ok: true, results: [{ summary: { imported: 2, alreadyThere: 0 } }] });
    // The same rows again: nothing new, still a run in the log.
    await syncBankConnections(connection.id);

    const [second, firstEntry] = await bankSyncEntries();
    expect(firstEntry).toMatchObject({ affectedCount: 2, params: { count: 2, skipped: 0, source: "Revolut" }, reversible: true });
    expect(firstEntry.params.error).toBeUndefined();
    expect(second).toMatchObject({ affectedCount: 0, params: { count: 0, skipped: 2, source: "Revolut" }, reversible: false });

    expect(await undoActivity(firstEntry.id)).toEqual({ ok: true, restored: 2, kept: 0 });
    expect(await db.select().from(s.transactions)).toHaveLength(0);
  });

  it("records a failed run as a non-reversible entry with its error", async () => {
    const { db, s, connection } = await setup();
    const { syncBankConnections } = await import("@/lib/bank-sync");
    const { undoActivity } = await import("@/lib/activity-log");
    api.transactions = () => ({ ok: false, error: "rateLimited" });

    const outcome = await syncBankConnections(connection.id);
    expect(outcome).toMatchObject({ ok: true, results: [{ summary: { imported: 0, error: "rateLimited" } }] });
    const [entry] = await bankSyncEntries();
    expect(entry).toMatchObject({ affectedCount: 0, params: { count: 0, skipped: 0, source: "Revolut", error: "rateLimited" }, reversible: false });
    expect(await undoActivity(entry.id)).toEqual({ ok: false, reason: "notReversible" });
    expect(await db.select().from(s.transactions)).toHaveLength(0);
  });

  it("records an expired consent as a failed run", async () => {
    const { connection } = await setup({ validUntil: "2020-01-01T00:00:00Z" });
    const { syncBankConnections } = await import("@/lib/bank-sync");
    await syncBankConnections(connection.id);
    const [entry] = await bankSyncEntries();
    expect(entry).toMatchObject({ params: { error: "expired" }, reversible: false });
  });
});

describe("account type from the bank", () => {
  it("fills an older linked account's type on the next sync, once", async () => {
    const { db, s, bank, account, connection } = await setup();
    const { eq } = await import("drizzle-orm");
    const { syncBankConnections } = await import("@/lib/bank-sync");
    api.transactions = () => ({ ok: true, value: { transactions: [] } });
    await syncBankConnections(connection.id);
    const [b] = await db.select().from(s.banks).where(eq(s.banks.id, bank.id));
    const [a] = await db.select().from(s.bankConnectionAccounts).where(eq(s.bankConnectionAccounts.id, account.id));
    expect(b.cardType).toBe("debitcard");
    expect(a.cashAccountType).toBe("CACC");
  });

  it("never overwrites a type the user picked", async () => {
    const { db, s, bank, connection } = await setup({ cardType: "savings" });
    const { eq } = await import("drizzle-orm");
    const { syncBankConnections } = await import("@/lib/bank-sync");
    api.transactions = () => ({ ok: true, value: { transactions: [] } });
    await syncBankConnections(connection.id);
    const [b] = await db.select().from(s.banks).where(eq(s.banks.id, bank.id));
    expect(b.cardType).toBe("savings");
  });

  it("sets the type on a newly linked account and on a linked one without a type", async () => {
    const { db, s, connection } = await setup();
    const { eq } = await import("drizzle-orm");
    const { saveAccountLinks } = await import("@/lib/bank-sync");
    const [plain] = await db.insert(s.banks).values({ displayName: "Old" }).returning();
    const [savings] = await db
      .insert(s.bankConnectionAccounts)
      .values({ connectionId: connection.id, accountUid: "uid-2", iban: "LT999250012345678901", name: "Vault", cashAccountType: "SVGS" })
      .returning();
    const [card] = await db
      .insert(s.bankConnectionAccounts)
      .values({ connectionId: connection.id, accountUid: "uid-3", iban: null, name: "Card", cashAccountType: "CARD" })
      .returning();

    await saveAccountLinks(connection.id, [
      { accountId: savings.id, choice: "new" },
      { accountId: card.id, choice: plain.id },
    ]);
    const [created] = await db.select().from(s.banks).where(eq(s.banks.accountNumber, "LT999250012345678901"));
    const [linked] = await db.select().from(s.banks).where(eq(s.banks.id, plain.id));
    expect(created.cardType).toBe("savings");
    expect(linked.cardType).toBe("creditcard");
  });
});

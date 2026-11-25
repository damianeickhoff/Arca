// The pure parts of the bank connection: the Enable Banking JWT, turning its
// transactions into import rows, and the duplicate keys a sync relies on. The hash
// formula is pinned on purpose: it is the duplicate key of every bank row already stored,
// so changing it makes the next sync insert those rows a second time.
import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildEnableBankingJwt, isUsablePrivateKey, JWT_LIFETIME_SECONDS } from "@/lib/enable-banking/jwt";
import {
  bankTransactionHash,
  cardTypeForCashAccountType,
  dropBeforeImportFrom,
  importFromMovedEarlier,
  mapEnableBankingTransaction,
  parseImportFrom,
  splitAlreadyImported,
  syncDateFrom,
  syncWindow,
  transactionDate,
  type EbTransaction,
} from "@/lib/enable-banking/map";
import { bankErrorFor } from "@/lib/enable-banking/client";
import { consentSeconds } from "@/lib/bank-sync";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const PKCS1 = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const APP_ID = "3f2b8c1e-0000-4000-8000-000000000001";

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

describe("buildEnableBankingJwt", () => {
  it("signs RS256 with kid = application id and the documented claims", () => {
    const jwt = buildEnableBankingJwt(APP_ID, PEM, 1_700_000_000);
    const [header, payload, signature] = jwt.split(".");
    expect(decode(header)).toEqual({ typ: "JWT", alg: "RS256", kid: APP_ID });
    expect(decode(payload)).toEqual({
      iss: "enablebanking.com",
      aud: "api.enablebanking.com",
      iat: 1_700_000_000,
      exp: 1_700_000_000 + JWT_LIFETIME_SECONDS,
    });
    expect(JWT_LIFETIME_SECONDS).toBe(3600);
    expect(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it("uses base64url without padding", () => {
    const jwt = buildEnableBankingJwt(APP_ID, PEM, 1);
    expect(jwt).not.toMatch(/[+/=]/);
  });

  it("trims a pasted id and key", () => {
    const jwt = buildEnableBankingJwt(`  ${APP_ID}\n`, `\n${PEM}\n\n`, 1);
    expect(decode(jwt.split(".")[0]).kid).toBe(APP_ID);
  });

  it("accepts PKCS#8 and PKCS#1 keys, refuses anything else", () => {
    expect(isUsablePrivateKey(PEM)).toBe(true);
    expect(isUsablePrivateKey(PKCS1)).toBe(true);
    expect(isUsablePrivateKey(publicKey.export({ type: "spki", format: "pem" }).toString())).toBe(false);
    expect(isUsablePrivateKey("not a key")).toBe(false);
    expect(isUsablePrivateKey("")).toBe(false);
  });
});

const IBAN = "NL91INGB0001234821";

function tx(overrides: Partial<EbTransaction> = {}): EbTransaction {
  return {
    transaction_id: "abc-123",
    entry_reference: "ref-9",
    booking_date: "2026-10-14",
    value_date: "2026-10-13",
    transaction_amount: { amount: "12.50", currency: "EUR" },
    credit_debit_indicator: "DBIT",
    status: "BOOK",
    creditor: { name: "Albert Heijn 1403" },
    creditor_account: { iban: "nl12 abna 0123 4567 89" },
    debtor: { name: "J. Jansen" },
    debtor_account: { iban: IBAN },
    remittance_information: ["Betaalpas AH 1403", " Amsterdam "],
    balance_after_transaction: { amount: "-40.10", currency: "EUR" },
    bank_transaction_code: { description: "Betaalautomaat", code: "BA" },
    ...overrides,
  };
}

describe("mapEnableBankingTransaction", () => {
  it("maps a card payment to an expense row", () => {
    expect(mapEnableBankingTransaction(tx(), { iban: IBAN, account: "nl91 ingb 0001 2348 21" })).toEqual({
      date: "2026-10-14",
      name: "Albert Heijn 1403",
      account: IBAN,
      counterAccount: "NL12ABNA0123456789",
      code: "BA",
      direction: "expense",
      amount: 12.5,
      type: "Betaalautomaat",
      description: "Betaalpas AH 1403 Amsterdam",
      hash: bankTransactionHash(tx(), IBAN),
      reportedBalance: -40.1,
    });
  });

  it("takes the payer as the other side of an incoming payment", () => {
    const row = mapEnableBankingTransaction(
      tx({
        credit_debit_indicator: "CRDT",
        transaction_amount: { amount: "2500.00", currency: "EUR" },
        debtor: { name: "Werkgever BV" },
        debtor_account: { iban: "NL02RABO0123456789" },
        creditor: { name: "J. Jansen" },
        creditor_account: { iban: IBAN },
      }),
      { iban: IBAN, account: IBAN },
    );
    expect(row).toMatchObject({ direction: "income", amount: 2500, name: "Werkgever BV", counterAccount: "NL02RABO0123456789" });
  });

  it("files rows under the linked account's number, not the IBAN", () => {
    expect(mapEnableBankingTransaction(tx(), { iban: IBAN, account: "CUSTOM-4" })?.account).toBe("CUSTOM-4");
  });

  it("falls back to the remittance text, then the transaction code, for a name", () => {
    expect(mapEnableBankingTransaction(tx({ creditor: null }), { iban: IBAN, account: IBAN })?.name).toBe("Betaalpas AH 1403");
    const bare = mapEnableBankingTransaction(tx({ creditor: null, remittance_information: [] }), { iban: IBAN, account: IBAN });
    expect(bare?.name).toBe("Betaalautomaat");
    expect(bare?.description).toBe("Betaalautomaat");
  });

  it("rounds to cents and never stores a negative amount", () => {
    expect(mapEnableBankingTransaction(tx({ transaction_amount: { amount: "-3.456" } }), { iban: IBAN, account: IBAN })?.amount).toBe(3.46);
  });

  it("skips a row without a date or a readable amount", () => {
    expect(mapEnableBankingTransaction(tx({ booking_date: null, value_date: null, transaction_date: null }), { iban: IBAN, account: IBAN })).toBeNull();
    expect(mapEnableBankingTransaction(tx({ transaction_amount: { amount: "n/a" } }), { iban: IBAN, account: IBAN })).toBeNull();
  });

  it("reads the booking date first and drops a time part", () => {
    expect(transactionDate(tx({ booking_date: null, value_date: "2026-10-13T10:00:00Z" }))).toBe("2026-10-13");
    expect(transactionDate(tx())).toBe("2026-10-14");
  });
});

describe("bankTransactionHash", () => {
  it("is pinned: sha256 of eb|<IBAN>|<transaction_id>, first 16 hex", () => {
    expect(bankTransactionHash(tx(), IBAN)).toBe("cd77f0d618259f73");
  });

  it("keys on the IBAN and the bank's transaction id, so a reconnect finds the same rows", () => {
    const a = bankTransactionHash(tx(), IBAN);
    expect(bankTransactionHash(tx({ remittance_information: ["changed"] }), "nl91 ingb 0001 2348 21")).toBe(a);
    expect(bankTransactionHash(tx(), "NL02RABO0123456789")).not.toBe(a);
    expect(bankTransactionHash(tx({ transaction_id: "abc-124" }), IBAN)).not.toBe(a);
  });

  it("falls back to the entry reference, then to the transaction's own fields", () => {
    const byRef = bankTransactionHash(tx({ transaction_id: null }), IBAN);
    expect(bankTransactionHash(tx({ transaction_id: null, booking_date: "2026-01-01" }), IBAN)).toBe(byRef);
    const bare = tx({ transaction_id: null, entry_reference: null });
    expect(bankTransactionHash(bare, IBAN)).not.toBe(byRef);
    expect(bankTransactionHash({ ...bare, transaction_amount: { amount: "12.51" } }, IBAN)).not.toBe(bankTransactionHash(bare, IBAN));
  });
});

describe("splitAlreadyImported", () => {
  const row = (date: string, amount: number, direction = "expense") => ({ date, amount, direction });

  it("drops bank rows a CSV import already brought in, one for one", () => {
    const rows = [row("2026-10-14", 3.2), row("2026-10-14", 3.2), row("2026-10-14", 3.2), row("2026-10-15", 10)];
    const existing = [row("2026-10-14", 3.2), row("2026-10-14", 3.2)];
    const { fresh, present } = splitAlreadyImported(rows, existing);
    expect(present).toHaveLength(2);
    expect(fresh).toEqual([row("2026-10-14", 3.2), row("2026-10-15", 10)]);
  });

  it("needs the same day, amount and direction", () => {
    const { fresh } = splitAlreadyImported([row("2026-10-14", 5)], [row("2026-10-13", 5), row("2026-10-14", 5, "income"), row("2026-10-14", 5.01)]);
    expect(fresh).toHaveLength(1);
  });

  it("compares amounts to the cent", () => {
    expect(splitAlreadyImported([row("2026-10-14", 0.1 + 0.2)], [row("2026-10-14", 0.3)]).present).toHaveLength(1);
  });
});

describe("syncDateFrom", () => {
  it("asks for everything the first time", () => {
    expect(syncDateFrom(null)).toBeNull();
    expect(syncDateFrom("garbage")).toBeNull();
  });

  it("looks a week back from the last sync for late bookings", () => {
    expect(syncDateFrom("2026-10-19")).toBe("2026-10-12");
    expect(syncDateFrom("2026-03-03", 7)).toBe("2026-02-24");
  });
});

describe("syncWindow", () => {
  it("asks for the longest history the first time without an Import from", () => {
    expect(syncWindow(null, null)).toEqual({ strategy: "longest" });
    expect(syncWindow(null, "not a date")).toEqual({ strategy: "longest" });
  });

  it("asks from Import from on the first sync", () => {
    expect(syncWindow(null, "2026-01-01")).toEqual({ date_from: "2026-01-01" });
  });

  it("looks a week back on later syncs", () => {
    expect(syncWindow("2026-10-19", null)).toEqual({ date_from: "2026-10-12" });
  });

  it("never asks from before Import from", () => {
    // The week back reaches before the date: the date wins.
    expect(syncWindow("2026-10-03", "2026-10-01")).toEqual({ date_from: "2026-10-01" });
    // The date is long past: the week back wins.
    expect(syncWindow("2026-10-19", "2026-01-01")).toEqual({ date_from: "2026-10-12" });
  });
});

describe("dropBeforeImportFrom", () => {
  const rows = [{ date: "2025-12-31" }, { date: "2026-01-01" }, { date: "2026-02-10" }];

  it("keeps rows on and after the date", () => {
    expect(dropBeforeImportFrom(rows, "2026-01-01")).toEqual([{ date: "2026-01-01" }, { date: "2026-02-10" }]);
  });

  it("keeps everything without a (valid) date", () => {
    expect(dropBeforeImportFrom(rows, null)).toBe(rows);
    expect(dropBeforeImportFrom(rows, "2026-13-01")).toBe(rows);
  });
});

describe("importFromMovedEarlier", () => {
  it("is true for an earlier date or a cleared one", () => {
    expect(importFromMovedEarlier("2026-03-01", "2026-01-01")).toBe(true);
    expect(importFromMovedEarlier("2026-03-01", null)).toBe(true);
  });

  it("is false for a later or the same date, or when there was none", () => {
    expect(importFromMovedEarlier("2026-01-01", "2026-03-01")).toBe(false);
    expect(importFromMovedEarlier("2026-01-01", "2026-01-01")).toBe(false);
    expect(importFromMovedEarlier(null, "2026-01-01")).toBe(false);
    expect(importFromMovedEarlier(null, null)).toBe(false);
  });
});

describe("parseImportFrom", () => {
  const today = "2026-11-25";

  it("clears on null or an empty string", () => {
    expect(parseImportFrom(null, today)).toEqual({ ok: true, value: null });
    expect(parseImportFrom(undefined, today)).toEqual({ ok: true, value: null });
    expect(parseImportFrom("", today)).toEqual({ ok: true, value: null });
  });

  it("takes a real date up to today", () => {
    expect(parseImportFrom("2026-01-01", today)).toEqual({ ok: true, value: "2026-01-01" });
    expect(parseImportFrom(" 2026-11-25 ", today)).toEqual({ ok: true, value: "2026-11-25" });
  });

  it("refuses a future date, a non-date and a non-string", () => {
    expect(parseImportFrom("2026-11-26", today)).toEqual({ ok: false });
    expect(parseImportFrom("2026-02-30", today)).toEqual({ ok: false });
    expect(parseImportFrom("1 Jan 2026", today)).toEqual({ ok: false });
    expect(parseImportFrom(20260101, today)).toEqual({ ok: false });
  });
});

describe("bankErrorFor", () => {
  it("recognises a consent that is gone", () => {
    expect(bankErrorFor(401, { error: "EXPIRED_SESSION" })).toBe("sessionExpired");
    expect(bankErrorFor(400, { error: "REVOKED_SESSION" })).toBe("sessionExpired");
    expect(bankErrorFor(404, { error: "SESSION_DOES_NOT_EXIST" })).toBe("sessionExpired");
  });

  it("maps the other statuses", () => {
    expect(bankErrorFor(401, { message: "bad jwt" })).toBe("unauthorized");
    expect(bankErrorFor(429, null)).toBe("rateLimited");
    expect(bankErrorFor(422, null)).toBe("badRequest");
    expect(bankErrorFor(500, null)).toBe("unavailable");
  });
});

describe("consentSeconds", () => {
  it("asks for what the bank allows, at most 180 days, 90 when unknown", () => {
    expect(consentSeconds(30 * 86400)).toBe(30 * 86400);
    expect(consentSeconds(365 * 86400)).toBe(180 * 86400);
    expect(consentSeconds(null)).toBe(90 * 86400);
    expect(consentSeconds(0)).toBe(90 * 86400);
  });
});

describe("cardTypeForCashAccountType", () => {
  it("maps the ISO 20022 cash account codes to an account type", () => {
    expect(cardTypeForCashAccountType("CACC")).toBe("debitcard");
    expect(cardTypeForCashAccountType("TRAN")).toBe("debitcard");
    expect(cardTypeForCashAccountType("CASH")).toBe("debitcard");
    expect(cardTypeForCashAccountType(" cacc ")).toBe("debitcard");
    expect(cardTypeForCashAccountType("SVGS")).toBe("savings");
    expect(cardTypeForCashAccountType("CARD")).toBe("creditcard");
  });

  it("leaves anything else to the user", () => {
    for (const code of ["LOAN", "OTHR", "", null, undefined]) expect(cardTypeForCashAccountType(code)).toBeNull();
  });
});

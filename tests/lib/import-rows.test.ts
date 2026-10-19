// Characterisation test for importParsedRows (import-rows.ts) against a real temporary
// database: categorisation priority, own-account transfers, Tikkie reimbursements,
// invalid dates, new-account discovery and duplicate detection on re-import.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateTestDb, clearFixtures, removeTestDb } from "../helpers/test-db";
import { detectAndParse } from "@/lib/bank-parsers";

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date(2026, 2, 20, 12));

const ids: Record<string, number> = {};

const BUNQ = [
  '"Datum";"Naam tegenpartij";"Rekeningnummer tegenpartij";"Rekeningnummer";"Bedrag";"Omschrijving"',
  // Category rule match.
  '"02-03-2026";"Albert Heijn 1234";"";"NL77BUNQ0123456789";"-45,10";"Boodschappen"',
  // Matches a recurring item (category + link).
  '"01-03-2026";"Woonstichting De Key";"NL10RABO0000000001";"NL77BUNQ0123456789";"-850,00";"Huur maart"',
  // Learned from a previously hand-categorised transaction with the same description.
  '"04-03-2026";"Kiosk Centraal";"";"NL77BUNQ0123456789";"-3,50";"Koffie"',
  // Keyword: the description contains the category name "Coolblue".
  '"05-03-2026";"Coolblue BV";"";"NL77BUNQ0123456789";"-199,00";"Order 123"',
  // Own-account transfer to the savings account (by counter-account).
  '"06-03-2026";"Spaarpot";"NL88BUNQ0987654321";"NL77BUNQ0123456789";"-200,00";"Sparen"',
  // Incoming Tikkie → reimbursement, forced to "Tikkies Inkomst".
  '"07-03-2026";"Jan Jansen";"NL20INGB0000000002";"NL77BUNQ0123456789";"+12,50";"Tikkie etentje"',
  // Unreadable date → dropped and counted.
  '"32-13-2026";"Kapot";"";"NL77BUNQ0123456789";"-1,00";"Ongeldige datum"',
].join("\n");

beforeAll(async () => {
  migrateTestDb();
  await clearFixtures();
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const category = async (key: string, name: string, group = "variable") => {
    const [row] = await db.insert(s.categories).values({ name, group, budgetType: group === "variable" ? "nodig" : null }).returning();
    ids[key] = row.id;
  };
  await category("groceries", "T Groceries");
  await category("housing", "T Housing", "bill");
  await category("snacks", "T Snacks");
  await category("coolblue", "Coolblue");
  await category("tikkies", "Tikkies Inkomst", "income");

  await db.insert(s.categoryRules).values({ categoryId: ids.groceries, namePattern: "albert heijn", nameWildcard: true });
  const [rent] = await db
    .insert(s.recurringItems)
    .values({ name: "Huur", type: "bill", amount: 850, categoryId: ids.housing, matchPattern: "woonstichting" })
    .returning();
  ids.rent = rent.id;
  await db.insert(s.banks).values({ accountNumber: "NL88BUNQ0987654321", displayName: "Spaarpot" });
  // A manual, hand-categorised transaction the importer can learn from.
  await db.insert(s.transactions).values({
    date: "2026-02-01", direction: "expense", type: "variabel", amount: 3, description: "Kiosk Centraal",
    categoryId: ids.snacks, manuallyCategorized: true,
  });
});

afterAll(() => {
  vi.useRealTimers();
  removeTestDb();
});

describe("importParsedRows", () => {
  it("imports, categorises and reports a first import", async () => {
    const { importParsedRows } = await import("@/lib/import-rows");
    const parsed = detectAndParse(BUNQ)!;
    expect(parsed.bankKey).toBe("bunq");

    const result = await importParsedRows(parsed.rows);
    expect(result).toMatchObject({ imported: 6, skipped: 0, invalidDates: 1, total: 7 });
    // Read back after the closing rule pass: Albert Heijn (rule), Woonstichting (recurring),
    // Kiosk (learned), Coolblue (keyword) and the Tikkie. The own-account transfer stays empty.
    expect(result.autoCategorised).toBe(5);
    expect(result.newAccounts.map((b) => b.accountNumber)).toEqual(["NL77BUNQ0123456789"]);

    const { db } = await import("@/db");
    const { transactions } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db.select().from(transactions).where(eq(transactions.source, "csv_import"));
    const byName = new Map(rows.map((r) => [r.description, r]));

    expect(byName.get("Albert Heijn 1234")).toMatchObject({ categoryId: ids.groceries, amount: 45.1, direction: "expense", type: "variabel" });
    expect(byName.get("Woonstichting De Key")).toMatchObject({ categoryId: ids.housing, recurringItemId: ids.rent });
    expect(byName.get("Spaarpot")).toMatchObject({ categoryId: null, recurringItemId: null, merchantId: null, counterAccount: "NL88BUNQ0987654321" });
    expect(byName.get("Jan Jansen")).toMatchObject({ isReimbursement: true, direction: "income", type: "inkomen", amount: 12.5 });

    // Categories guessed from learned history, a keyword match and the Tikkie rule survive
    // the closing applyAllRules() pass — it only overrides where a rule actually matches.
    expect(byName.get("Kiosk Centraal")!.categoryId).toBe(ids.snacks);
    expect(byName.get("Coolblue BV")!.categoryId).toBe(ids.coolblue);
    expect(byName.get("Jan Jansen")!.categoryId).toBe(ids.tikkies);
    // …and the reported count is exactly the inserted rows that are categorised now.
    expect(rows.filter((r) => r.categoryId != null)).toHaveLength(result.autoCategorised);
  });

  it("a later rule pass overrides only where a rule matches", async () => {
    const { db } = await import("@/db");
    const { transactions, categoryRules } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { applyAllRules } = await import("@/lib/apply-rules");
    // A new rule for Coolblue re-categorises it; every other row keeps its category.
    await db.insert(categoryRules).values({ categoryId: ids.groceries, namePattern: "coolblue", nameWildcard: true });
    await applyAllRules();
    const rows = await db.select().from(transactions).where(eq(transactions.source, "csv_import"));
    const byName = new Map(rows.map((r) => [r.description, r]));
    expect(byName.get("Coolblue BV")!.categoryId).toBe(ids.groceries);
    expect(byName.get("Kiosk Centraal")!.categoryId).toBe(ids.snacks);
    expect(byName.get("Jan Jansen")!.categoryId).toBe(ids.tikkies);
    await db.delete(categoryRules).where(eq(categoryRules.namePattern, "coolblue"));
  });

  it("skips every row on a re-import of the same file (duplicate detection by importHash)", async () => {
    const { importParsedRows } = await import("@/lib/import-rows");
    const result = await importParsedRows(detectAndParse(BUNQ)!.rows);
    expect(result).toMatchObject({ imported: 0, skipped: 6, invalidDates: 1, total: 7, autoCategorised: 0 });
    expect(result.newAccounts).toEqual([]);

    const { db } = await import("@/db");
    const { transactions } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    expect(await db.select().from(transactions).where(eq(transactions.source, "csv_import"))).toHaveLength(6);
  });

  it("backfills a reported balance on a duplicate without overwriting one already stored", async () => {
    const { importParsedRows } = await import("@/lib/import-rows");
    const [first] = detectAndParse(BUNQ)!.rows;
    await importParsedRows([{ ...first, reportedBalance: 1000 }]);
    await importParsedRows([{ ...first, reportedBalance: 2000 }]);

    const { db } = await import("@/db");
    const { transactions } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(transactions).where(eq(transactions.importHash, first.hash));
    expect(row.reportedBalance).toBe(1000);
  });

  it("stores a bank sync's rows with source bank and marks the import as running meanwhile", async () => {
    const { importParsedRows } = await import("@/lib/import-rows");
    const { isImportRunning } = await import("@/lib/import-lock");
    const [first] = detectAndParse(BUNQ)!.rows;
    const pending = importParsedRows([{ ...first, hash: "bank-sync-test" }], { source: "bank" });
    expect(isImportRunning()).toBe(true);
    expect(await pending).toMatchObject({ imported: 1, skipped: 0 });
    expect(isImportRunning()).toBe(false);

    const { db } = await import("@/db");
    const { transactions } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(transactions).where(eq(transactions.importHash, "bank-sync-test"));
    expect(row.source).toBe("bank");
  });
});

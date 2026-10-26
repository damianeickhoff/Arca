// Money between the owner's own accounts: pair detection, accounts kept by hand and
// what their type means (savings is saved, a joint account is spending), "Not a
// transfer", "Exclude from reports" — and that every loader leaves the same rows out
// (outOfReportsExpr). The fixtures are the cases found in the real
// data: ING savings moves, investment deposits, Revolut top-ups, transfers between two
// Revolut accounts and the joint account.
//
// The clock is pinned to Wednesday 21 October 2026 with budget months from the 1st.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { findTransferPairs, type PairRow } from "@/lib/transfer-pairs";
import { suggestAccounts, type AccountSuggestion } from "@/lib/account-suggestions";
import { clearFixtures, migrateTestDb, removeTestDb } from "../helpers/test-db";

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date(2026, 9, 21, 12));

const FM = { defaultStartDay: 1, overrides: {}, weekendRollback: false };
const ING = "NL11INGB0001234567";
const REVOLUT = "NL17REVO0007654321";
const SORAYA = "140E9BD4-22F1-E2F3-0340-0C99BAA6C782";
const JOINT = "NL19INGB0398522626";

const ACCOUNTS = [
  { accountNumber: ING, displayName: "ING betaalrekening" },
  { accountNumber: REVOLUT, displayName: "Revolut Main" },
  { accountNumber: SORAYA, displayName: "Revolut Soraya" },
];

let nextId = 1;
const row = (r: Partial<PairRow> & Pick<PairRow, "date" | "direction" | "amount" | "account" | "description">): PairRow => ({
  id: nextId++,
  counterAccount: null,
  rawDescription: null,
  ...r,
});

describe("findTransferPairs", () => {
  it("pairs a card payment to Revolut with the top-up it paid for, within two days", () => {
    const out = row({ date: "2026-06-15", direction: "expense", amount: 100, account: ING, description: "Revolut**4527*" });
    const inc = row({ date: "2026-06-14", direction: "income", amount: 100, account: REVOLUT, description: "Apple Pay Top-Up by *4128" });
    expect(findTransferPairs([out, inc], ACCOUNTS)).toEqual([[out.id, inc.id]]);
  });

  it("pairs a move between two Revolut accounts (the same text on both legs)", () => {
    const out = row({ date: "2026-10-02", direction: "expense", amount: 100, account: REVOLUT, description: "To EUR Soraya’s uitgave" });
    const inc = row({ date: "2026-10-02", direction: "income", amount: 100, account: SORAYA, description: "To EUR Soraya’s uitgave" });
    expect(findTransferPairs([out, inc], ACCOUNTS)).toEqual([[out.id, inc.id]]);
  });

  it("never pairs a shop payment that happens to have the same amount", () => {
    const shop = row({ date: "2026-07-21", direction: "expense", amount: 30, account: REVOLUT, description: "Tinq Ochten Cuneraweg" });
    const savings = row({ date: "2026-07-21", direction: "income", amount: 30, account: ING, description: "Oranje spaarrekening M58896551" });
    expect(findTransferPairs([shop, savings], ACCOUNTS)).toEqual([]);
  });

  it("never pairs a payment to someone else's account, or two days apart on one account", () => {
    const paid = row({ date: "2026-05-01", direction: "expense", amount: 50, account: ING, description: "Top-up", counterAccount: "NL98ABNA0123456789" });
    const inc = row({ date: "2026-05-01", direction: "income", amount: 50, account: REVOLUT, description: "Apple Pay Top-Up by *4128" });
    const sameAccount = row({ date: "2026-05-01", direction: "expense", amount: 50, account: REVOLUT, description: "Top-up refund" });
    const late = row({ date: "2026-05-04", direction: "expense", amount: 50, account: ING, description: "Revolut**4527*" });
    expect(findTransferPairs([paid, inc, sameAccount, late], ACCOUNTS)).toEqual([]);
  });

  it("matches one to one: two top-ups of the same amount take one card payment each", () => {
    const outA = row({ date: "2026-06-13", direction: "expense", amount: 50, account: ING, description: "Revolut**4527*" });
    const outB = row({ date: "2026-06-13", direction: "expense", amount: 50, account: ING, description: "Revolut**4527*" });
    const inA = row({ date: "2026-06-13", direction: "income", amount: 50, account: REVOLUT, description: "Apple Pay Top-Up by *4128" });
    const pairs = findTransferPairs([outA, outB, inA], ACCOUNTS);
    expect(pairs).toHaveLength(1);
    const inB = row({ date: "2026-06-14", direction: "income", amount: 50, account: REVOLUT, description: "Apple Pay Top-Up by *4128" });
    expect(findTransferPairs([outA, outB, inA, inB], ACCOUNTS)).toHaveLength(2);
  });
});

describe("suggestAccounts", () => {
  const s = (description: string, direction: string, amount: number, extra: { rawDescription?: string; counterAccount?: string } = {}) => ({
    description,
    direction,
    amount,
    rawDescription: extra.rawDescription ?? null,
    counterAccount: extra.counterAccount ?? null,
  });
  const rows = [
    s("Oranje spaarrekening M58896551", "expense", 625, { rawDescription: "Naar Oranje spaarrekening M58896551 Valutadatum: 24-10-2026" }),
    s("Oranje spaarrekening M58896551", "income", 50),
    s("JLD Eickhoff JJM van Gelderen", "expense", 377.76, { rawDescription: "Naar Beleggingsrek. 15391118 Valutadatum: 25-09-2026", counterAccount: "15391118" }),
    s("Revolut**4527* Dublin IRL", "expense", 700),
    s("Hr JLD Eickhoff,Mw JJM van Gelderen (boodschappen)", "expense", 100, { counterAccount: JOINT }),
    s("Hr JLD Eickhoff,Mw JJM van Gelderen", "expense", 50, { counterAccount: JOINT }),
    s("Hr JLD Eickhoff,Mw JJM van Gelderen", "income", 20, { counterAccount: JOINT }),
    // One payment to a couple is not a joint account.
    s("Hr A Jansen,Mw B Jansen", "expense", 40, { counterAccount: "NL55RABO0000000001" }),
    s("Albert Heijn 1234", "expense", 40),
  ];
  const brief = (f: AccountSuggestion) => (f.target === "bank" ? [f.name, "bank", f.bankName, f.matchName] : [f.name, f.type, f.accountNumber, f.matchNames]);

  it("finds savings, investments and a joint account with their type, biggest first", () => {
    expect(suggestAccounts(rows, []).map(brief)).toEqual([
      ["Revolut", "betaalrekening", null, ["Revolut**4527"]],
      ["Oranje spaarrekening M58896551", "spaarrekening", "M58896551", []],
      ["Beleggingsrek. 15391118", "beleggingen", "15391118", []],
      ["Hr JLD Eickhoff,Mw JJM van Gelderen", "gezamenlijk", JOINT, []],
    ]);
    expect(suggestAccounts(rows, []).find((f) => f.key === "M58896551")).toMatchObject({ count: 2, total: 675 });
  });

  it("offers a card top-up as another name for the imported account it tops up", () => {
    const found = suggestAccounts(rows, [{ id: 7, kind: "bank", name: "Revolut Main", accountNumber: REVOLUT, matchNames: null }]);
    expect(brief(found[0])).toEqual(["Revolut**4527", "bank", "Revolut Main", "Revolut**4527"]);
  });

  it("leaves out accounts that exist already and hidden ones", () => {
    const known = [
      { kind: "handKept" as const, name: "Oranje", accountNumber: "M58896551", matchNames: null },
      { id: 7, kind: "bank" as const, name: "Revolut Main", accountNumber: REVOLUT, matchNames: JSON.stringify(["Revolut**4527"]) },
    ];
    expect(suggestAccounts(rows, known, ["15391118"]).map((f) => f.key)).toEqual([JOINT]);
  });
});

describe("every screen counts own-account money by what the account is", () => {
  // Filled in beforeAll: transaction ids by name.
  const id: Record<string, number> = {};

  beforeAll(async () => {
    migrateTestDb();
    await clearFixtures();
    const { db } = await import("@/db");
    const s = await import("@/db/schema");

    const [salary] = await db.insert(s.categories).values({ name: "T Salary", group: "income" }).returning();
    const [groceries] = await db.insert(s.categories).values({ name: "T Groceries", group: "", budgetType: "nodig" }).returning();
    const [fees] = await db.insert(s.categories).values({ name: "T Bank fees", group: "", budgetType: "nodig" }).returning();
    const [savings] = await db.insert(s.categories).values({ name: "T Savings", group: "savings" }).returning();
    for (const a of ACCOUNTS) await db.insert(s.banks).values({ ...a, cardType: "debitcard" });

    let n = 0;
    const add = async (name: string, r: Partial<typeof s.transactions.$inferInsert> & { date: string; direction: string; amount: number; description: string }) => {
      const [inserted] = await db
        .insert(s.transactions)
        .values({ type: r.direction === "income" ? "inkomen" : "variabel", account: ING, source: "bank", importHash: `h${++n}`, ...r })
        .returning();
      id[name] = inserted.id;
    };
    // Income and day-to-day spending in October: 3000 in, 200 out.
    await add("salary", { date: "2026-10-01", direction: "income", amount: 3000, description: "Werkgever BV", categoryId: salary.id, counterAccount: "NL01ABNA0000000001" });
    await add("groceries", { date: "2026-10-05", direction: "expense", amount: 200, description: "Albert Heijn 1234", categoryId: groceries.id });
    // Savings and investments kept by hand: saved, net.
    await add("savingsOut", { date: "2026-10-06", direction: "expense", amount: 625, description: "Oranje spaarrekening M58896551", rawDescription: "Naar Oranje spaarrekening M58896551", categoryId: savings.id });
    await add("savingsBack", { date: "2026-10-07", direction: "income", amount: 71.63, description: "Oranje spaarrekening M58896551", rawDescription: "Van Oranje spaarrekening M58896551 Boodschappen" });
    await add("savingsUncategorised", { date: "2026-10-08", direction: "expense", amount: 100, description: "Oranje spaarrekening M58896551" });
    await add("investment", { date: "2026-10-09", direction: "expense", amount: 377.76, description: "JLD Eickhoff JJM van Gelderen", rawDescription: "Naar Beleggingsrek. 15391118", counterAccount: "15391118" });
    // Revolut: a top-up pair, an older card payment recognised by Revolut's other name,
    // and a move between two Revolut accounts.
    await add("cardTopUp", { date: "2026-10-10", direction: "expense", amount: 700, description: "Revolut**4527* Dublin IRL", categoryId: fees.id });
    await add("topUp", { date: "2026-10-10", direction: "income", amount: 700, description: "Apple Pay Top-Up by *4128", account: REVOLUT });
    await add("cardTopUpAlone", { date: "2026-10-02", direction: "expense", amount: 55, description: "Revolut**4527*" });
    await add("sorayaOut", { date: "2026-10-11", direction: "expense", amount: 100, description: "To EUR Soraya’s uitgave", account: REVOLUT });
    await add("sorayaIn", { date: "2026-10-11", direction: "income", amount: 100, description: "To EUR Soraya’s uitgave", account: SORAYA });
    // The joint account: 1500 of household money in, 250 paid back.
    await add("jointOut", { date: "2026-10-12", direction: "expense", amount: 1500, description: "Hr JLD Eickhoff,Mw JJM van Gelderen", counterAccount: JOINT });
    await add("jointIn", { date: "2026-10-13", direction: "income", amount: 250, description: "Hr JLD Eickhoff,Mw JJM van Gelderen", counterAccount: JOINT });
    // The owner left this one out of reports by hand.
    await add("excluded", { date: "2026-10-14", direction: "expense", amount: 80, description: "Gift for a friend", categoryId: groceries.id, excludeFromReports: true });

    const { eq } = await import("drizzle-orm");
    await db.update(s.banks).set({ matchNames: JSON.stringify(["Revolut**4527"]) }).where(eq(s.banks.accountNumber, REVOLUT));
    await db.insert(s.vermogenAccounts).values([
      { name: "Oranje spaarrekening", type: "spaarrekening", accountNumber: "M58896551" },
      { name: "Beleggingsrekening", type: "beleggingen", accountNumber: "15391118", value: 4000, lastUpdated: "2026-10-01" },
      { name: "Joint account", type: "gezamenlijk", accountNumber: JOINT },
    ]);
    const { pairNewTransfers } = await import("@/lib/internal-transfers");
    expect(pairNewTransfers()).toBe(2);
    const { markJointPaybacks } = await import("@/lib/joint-accounts");
    expect(markJointPaybacks((db as unknown as { $client: import("better-sqlite3").Database }).$client)).toBe(1);
  });

  afterAll(() => removeTestDb());

  async function flags() {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { isInternalTransferExpr, outOfReportsExpr, effectiveTransferTypeExpr } = await import("@/lib/internal-transfers");
    const rows = await db
      .select({ id: s.transactions.id, transfer: isInternalTransferExpr, out: outOfReportsExpr, kind: effectiveTransferTypeExpr, paidBack: s.transactions.isReimbursement })
      .from(s.transactions);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return (name: string) => byId.get(id[name])!;
  }

  it("flags moves between own accounts as transfers, with the kind of the other side", async () => {
    const f = await flags();
    for (const name of ["savingsOut", "savingsBack", "savingsUncategorised", "investment", "cardTopUp", "topUp", "cardTopUpAlone", "sorayaOut", "sorayaIn"]) {
      expect([name, !!f(name).transfer, !!f(name).out]).toEqual([name, true, true]);
    }
    expect([!!f("salary").out, !!f("groceries").out]).toEqual([false, false]);
    expect([!!f("excluded").transfer, !!f("excluded").out]).toEqual([false, true]);
    expect([f("savingsOut").kind, f("investment").kind]).toEqual(["savings", "investments"]);
  });

  it("a joint account is spending, and what it pays back isn't income", async () => {
    const f = await flags();
    expect([!!f("jointOut").transfer, !!f("jointIn").transfer]).toEqual([false, false]);
    expect([!!f("jointOut").paidBack, !!f("jointIn").paidBack]).toEqual([false, true]);
  });

  it("Health, Trends, budget and income agree: 3000 in, 1700 out, 1031.13 saved", async () => {
    const { getMonthTotals } = await import("@/lib/financial-health-data");
    const [october] = await getMonthTotals(["2026-10"], FM);
    // Gross shared-cost mode: the 250 paid back comes off the expenses.
    expect([october.income, october.expenses]).toEqual([3000, 1450]);

    const { getCurrentMonthIncome } = await import("@/lib/income-summary");
    expect(await getCurrentMonthIncome(FM)).toBe(3000);

    const { loadTrends } = await import("@/app/trends/load-trends");
    const trends = await loadTrends({ range: { kind: "months", count: 3 }, financialMonth: FM });
    const flow = trends.flows.at(-1)!;
    // Saved is net: into savings (a savings category, an uncategorised move, the
    // investment deposit) minus what came back out of savings.
    expect([flow.income, flow.expense, flow.saved]).toEqual([3000, 1700, 1031.13]);

    const { getBudgetOverview } = await import("@/lib/budget-overview");
    const budget = await getBudgetOverview(FM);
    expect(budget.totalSpent).toBe(1700);
  });

  it("a pair the owner calls \"Not a transfer\" counts again, on both legs", async () => {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { breakTransferPair, pairNewTransfers } = await import("@/lib/internal-transfers");
    await db.update(s.transactions).set({ notTransfer: true }).where(eq(s.transactions.id, id.sorayaOut));
    breakTransferPair(id.sorayaOut);
    // A new pass leaves the row alone.
    pairNewTransfers();
    const f = await flags();
    expect([!!f("sorayaOut").transfer, !!f("sorayaIn").transfer]).toEqual([false, false]);
    // …and so does an account match: "Not a transfer" wins over every rule.
    await db.update(s.transactions).set({ notTransfer: true }).where(eq(s.transactions.id, id.investment));
    expect(!!(await flags())("investment").transfer).toBe(false);
  });

  it("importing an account kept by hand turns it into that bank account", async () => {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { importParsedRows } = await import("@/lib/import-rows");
    const result = await importParsedRows([
      { date: "2026-10-15", name: "Rente", account: "M58896551", counterAccount: "", code: "", direction: "income", amount: 3.1, type: "", description: "Rente", hash: "import-1" },
    ]);
    expect(result.newAccounts.map((b) => [b.accountNumber, b.displayName, b.cardType])).toEqual([["M58896551", "Oranje spaarrekening", "savings"]]);
    const [kept] = await db.select().from(s.vermogenAccounts).where(eq(s.vermogenAccounts.name, "Oranje spaarrekening"));
    expect([kept.active, kept.accountNumber]).toEqual([false, null]);
    // Still a transfer: the ING side now points at an imported savings account.
    expect(!!(await flags())("savingsOut").transfer).toBe(true);
  });
});

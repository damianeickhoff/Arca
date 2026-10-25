// Characterisation tests for the pure matching rules: recurring-item matching
// (recurring-match.ts), category rules (apply-rules.ts) and own-account transfer
// detection (internal-transfers.ts). These modules also export DB-backed loaders;
// those are exercised through importParsedRows in import-rows.test.ts.
import { describe, expect, it } from "vitest";
import { matchRecurringItem, transactionMatchesRecurringItem, type RecurringMatcher } from "@/lib/recurring-match";
import { normalizeMatchPatterns, parseAltMatchPatterns, recurringItemPatterns } from "@/lib/recurring-patterns";
import { matchRules } from "@/lib/apply-rules";
import { isOwnAccountTransfer, normalizeAccountNumber } from "@/lib/internal-transfers";
import type { Bank, CategoryRule } from "@/db/schema";

function matcher(overrides: Partial<RecurringMatcher>): RecurringMatcher {
  return {
    id: 1,
    name: "Item",
    matchPattern: null,
    matchWholeWord: false,
    matchAmount: null,
    matchAmountMin: null,
    matchAmountMax: null,
    categoryId: null,
    friendlyName: null,
    active: true,
    ...overrides,
  };
}

describe("transactionMatchesRecurringItem", () => {
  it("needs a non-blank pattern", () => {
    expect(transactionMatchesRecurringItem("Netflix", 10, matcher({ matchPattern: null }))).toBe(false);
    expect(transactionMatchesRecurringItem("Netflix", 10, matcher({ matchPattern: "   " }))).toBe(false);
  });

  it("matches a contained pattern case-insensitively", () => {
    expect(transactionMatchesRecurringItem("NETFLIX.COM Amsterdam", 13.99, matcher({ matchPattern: "netflix" }))).toBe(true);
    expect(transactionMatchesRecurringItem("netflixer", 13.99, matcher({ matchPattern: "Netflix " }))).toBe(true);
  });

  it("whole-word mode rejects a pattern inside a longer word but allows punctuation", () => {
    const item = matcher({ matchPattern: "ns", matchWholeWord: true });
    expect(transactionMatchesRecurringItem("NS Reizigers", 4.1, item)).toBe(true);
    expect(transactionMatchesRecurringItem("NSPCC", 4.1, item)).toBe(false);
    expect(transactionMatchesRecurringItem("ticket/ns/2026", 4.1, item)).toBe(true);
  });

  it("exact amount mode compares absolute values within a cent", () => {
    const item = matcher({ matchPattern: "gym", matchAmount: 29.99 });
    expect(transactionMatchesRecurringItem("Gym", -29.99, item)).toBe(true);
    expect(transactionMatchesRecurringItem("Gym", 29.995, item)).toBe(true);
    // "Within a cent" is inclusive, even though 30.00 − 29.99 is 0.010000000000001 as a float.
    expect(transactionMatchesRecurringItem("Gym", 30.0, item)).toBe(true);
    expect(transactionMatchesRecurringItem("Gym", 29.98, item)).toBe(true);
    expect(transactionMatchesRecurringItem("Gym", 30.01, item)).toBe(false);
    expect(transactionMatchesRecurringItem("Gym", 29.97, item)).toBe(false);
  });

  it("range mode wins over exact mode and is inclusive with a cent of slack", () => {
    const item = matcher({ matchPattern: "energie", matchAmount: 1, matchAmountMin: 90, matchAmountMax: 110 });
    expect(transactionMatchesRecurringItem("Energie", 89.99, item)).toBe(true);
    expect(transactionMatchesRecurringItem("Energie", 89.98, item)).toBe(false);
    expect(transactionMatchesRecurringItem("Energie", 110.01, item)).toBe(true);
    expect(transactionMatchesRecurringItem("Energie", 1, item)).toBe(false);
    expect(transactionMatchesRecurringItem("Energie", 500, matcher({ matchPattern: "energie", matchAmountMin: 90 }))).toBe(true);
  });
});

describe("alternative match patterns", () => {
  it("matches the old or the new name of a renamed payee", () => {
    const item = matcher({ matchPattern: "netflix.com", altMatchPatterns: JSON.stringify(["Netflix International"]) });
    expect(transactionMatchesRecurringItem("NETFLIX.COM Amsterdam", 13.99, item)).toBe(true);
    expect(transactionMatchesRecurringItem("Netflix International B.V.", 13.99, item)).toBe(true);
    expect(transactionMatchesRecurringItem("Spotify AB", 13.99, item)).toBe(false);
    // An already parsed list works too (the editor's preview builds one).
    expect(transactionMatchesRecurringItem("Netflix International B.V.", 13.99, matcher({ matchPattern: "netflix.com", altMatchPatterns: ["netflix international"] }))).toBe(true);
  });

  it("applies the amount rule to every name", () => {
    const item = matcher({ matchPattern: "old gym", altMatchPatterns: '["new gym"]', matchAmount: 29.99 });
    expect(transactionMatchesRecurringItem("New Gym BV", 29.99, item)).toBe(true);
    expect(transactionMatchesRecurringItem("New Gym BV", 35, item)).toBe(false);
    const ranged = matcher({ matchPattern: "eneco", altMatchPatterns: '["vattenfall"]', matchAmountMin: 90, matchAmountMax: 110 });
    expect(transactionMatchesRecurringItem("Vattenfall", 100, ranged)).toBe(true);
    expect(transactionMatchesRecurringItem("Vattenfall", 150, ranged)).toBe(false);
  });

  it("applies whole-word mode to every name", () => {
    const item = matcher({ matchPattern: "ns", altMatchPatterns: '["gvb"]', matchWholeWord: true });
    expect(transactionMatchesRecurringItem("GVB Amsterdam", 3.4, item)).toBe(true);
    expect(transactionMatchesRecurringItem("GVBX Holding", 3.4, item)).toBe(false);
  });

  it("ignores bad JSON, non-strings and blank names, keeping the main pattern", () => {
    for (const bad of ["not json", "{\"a\":1}", "[1, null, \"  \"]", ""]) {
      const item = matcher({ matchPattern: "netflix", altMatchPatterns: bad });
      expect(transactionMatchesRecurringItem("Netflix", 10, item)).toBe(true);
      expect(transactionMatchesRecurringItem("Spotify", 10, item)).toBe(false);
    }
    expect(parseAltMatchPatterns("not json")).toEqual([]);
    expect(parseAltMatchPatterns('["a", 2, " b "]')).toEqual(["a", "b"]);
  });

  it("matches through an extra name when the main pattern is empty", () => {
    expect(transactionMatchesRecurringItem("Netflix", 10, matcher({ matchPattern: null, altMatchPatterns: '["netflix"]' }))).toBe(true);
  });

  it("lists every pattern once, main first", () => {
    expect(recurringItemPatterns({ matchPattern: " Netflix.com ", altMatchPatterns: '["Netflix International", " "]' })).toEqual([
      "netflix.com",
      "netflix international",
    ]);
  });

  it("normalizes what a save stores", () => {
    expect(normalizeMatchPatterns("netflix.com", ["", "  Netflix International ", "NETFLIX.COM", "netflix international"])).toEqual({
      matchPattern: "netflix.com",
      altMatchPatterns: '["Netflix International"]',
    });
    expect(normalizeMatchPatterns("netflix", [" ", ""])).toEqual({ matchPattern: "netflix", altMatchPatterns: null });
    expect(normalizeMatchPatterns("netflix", null)).toEqual({ matchPattern: "netflix", altMatchPatterns: null });
    // An empty main pattern takes the first extra name…
    expect(normalizeMatchPatterns("", ["old", "new"])).toEqual({ matchPattern: "old", altMatchPatterns: '["new"]' });
    // …unless the save leaves the main pattern alone.
    expect(normalizeMatchPatterns(null, ["old", "new"], { promote: false })).toEqual({ matchPattern: null, altMatchPatterns: '["old","new"]' });
  });
});

describe("matchRecurringItem", () => {
  it("returns the first active match in list order", () => {
    const items = [
      matcher({ id: 1, matchPattern: "spotify", active: false }),
      matcher({ id: 2, matchPattern: "spot" }),
      matcher({ id: 3, matchPattern: "spotify" }),
    ];
    expect(matchRecurringItem("Spotify AB", 10.99, items)?.id).toBe(2);
    expect(matchRecurringItem("Albert Heijn", 10.99, items)).toBeNull();
  });
});

function rule(overrides: Partial<CategoryRule>): CategoryRule {
  return {
    id: 1,
    categoryId: 100,
    namePattern: null,
    nameWildcard: true,
    nameWholeWord: false,
    amount: null,
    amountMin: null,
    amountMax: null,
    direction: null,
    bankId: null,
    createdAt: null,
    ...overrides,
  };
}

const noBanks = new Map<string, Bank>();

describe("matchRules", () => {
  it("returns null when no rule matches and the first match otherwise", () => {
    const rules = [rule({ id: 1, categoryId: 1, namePattern: "jumbo" }), rule({ id: 2, categoryId: 2, namePattern: "albert" })];
    expect(matchRules("Albert Heijn 1234", 10, "expense", null, rules, noBanks)).toBe(2);
    expect(matchRules("Lidl", 10, "expense", null, rules, noBanks)).toBeNull();
  });

  it("wildcard=false means the trimmed, lower-cased description must equal the pattern", () => {
    const r = [rule({ namePattern: "Albert Heijn", nameWildcard: false })];
    expect(matchRules("  ALBERT HEIJN ", 1, "expense", null, r, noBanks)).toBe(100);
    expect(matchRules("Albert Heijn 1234", 1, "expense", null, r, noBanks)).toBeNull();
  });

  it("whole-word wins over wildcard", () => {
    const r = [rule({ namePattern: "ah", nameWholeWord: true, nameWildcard: false })];
    expect(matchRules("AH to go", 1, "expense", null, r, noBanks)).toBe(100);
    expect(matchRules("Ahold", 1, "expense", null, r, noBanks)).toBeNull();
  });

  it("filters on direction", () => {
    const r = [rule({ namePattern: "tikkie", direction: "income" })];
    expect(matchRules("Tikkie van Jan", 5, "income", null, r, noBanks)).toBe(100);
    expect(matchRules("Tikkie van Jan", 5, "expense", null, r, noBanks)).toBeNull();
  });

  it("compares magnitudes within a cent, for exact amounts and ranges alike", () => {
    // The same rule as the recurring matcher: the sign doesn't matter.
    expect(matchRules("x", -10, "expense", null, [rule({ amount: 10 })], noBanks)).toBe(100);
    expect(matchRules("x", 10, "expense", null, [rule({ amount: -10 })], noBanks)).toBe(100);
    expect(matchRules("x", 10.005, "expense", null, [rule({ amount: 10 })], noBanks)).toBe(100);
    expect(matchRules("x", 30, "expense", null, [rule({ amount: 29.99 })], noBanks)).toBe(100);
    expect(matchRules("x", 30.01, "expense", null, [rule({ amount: 29.99 })], noBanks)).toBeNull();
    expect(matchRules("x", 4.99, "expense", null, [rule({ amountMin: 5 })], noBanks)).toBe(100);
    expect(matchRules("x", 4.98, "expense", null, [rule({ amountMin: 5 })], noBanks)).toBeNull();
    expect(matchRules("x", -10, "expense", null, [rule({ amountMin: 5, amountMax: 15 })], noBanks)).toBe(100);
    expect(matchRules("x", 20, "expense", null, [rule({ amountMax: 15 })], noBanks)).toBeNull();
  });

  it("bank filter compares the transaction account with the bank's account number", () => {
    const bank = { id: 7, accountNumber: "NL11INGB0001234567" } as Bank;
    const banks = new Map([[bank.accountNumber!, bank]]);
    const r = [rule({ namePattern: "shop", bankId: 7 })];
    expect(matchRules("shop", 1, "expense", "NL11INGB0001234567", r, banks)).toBe(100);
    expect(matchRules("shop", 1, "expense", "NL99OTHER", r, banks)).toBeNull();
    expect(matchRules("shop", 1, "expense", "NL11INGB0001234567", [rule({ namePattern: "shop", bankId: 8 })], banks)).toBeNull();
  });
});

describe("own-account transfers", () => {
  it("normalizeAccountNumber strips whitespace and upper-cases; blank becomes null", () => {
    expect(normalizeAccountNumber(" nl11 ingb 0001 2345 67 ")).toBe("NL11INGB0001234567");
    expect(normalizeAccountNumber("   ")).toBeNull();
    expect(normalizeAccountNumber(undefined)).toBeNull();
  });

  const own = [
    { accountNumber: "NL11INGB0001234567", displayName: "Betaalrekening" },
    { accountNumber: "NL22INGB0007654321", displayName: "Oranje Spaarrekening" },
  ];

  it("flags a counter-account that is another own account", () => {
    expect(isOwnAccountTransfer({ account: "NL11INGB0001234567", counterAccount: "nl22 ingb 0007 6543 21" }, own)).toBe(true);
  });

  it("flags a description that mentions another own account number or an own account name", () => {
    expect(isOwnAccountTransfer({ account: "NL11INGB0001234567", description: "Naar NL22INGB0007654321" }, own)).toBe(true);
    expect(isOwnAccountTransfer({ account: "X", name: "Oranje Spaarrekening" }, own)).toBe(true);
  });

  it("CURRENT BEHAVIOUR: an account's own display name in the description also counts", () => {
    // The name check isn't limited to *other* accounts, so a row on the Betaalrekening
    // whose description contains "Betaalrekening" is treated as a transfer too.
    expect(isOwnAccountTransfer({ account: "NL11INGB0001234567", description: "Betaalrekening kosten" }, own)).toBe(true);
  });

  it("does not flag an ordinary payment", () => {
    expect(isOwnAccountTransfer({ account: "NL11INGB0001234567", counterAccount: "NL98ABNA0123456789", name: "Albert Heijn" }, own)).toBe(false);
  });
});

// The category picker's suggestions and rule preview, against a throwaway database
// built by the app's own migration (see tests/helpers/test-db.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateTestDb, clearFixtures, removeTestDb } from "../helpers/test-db";
import { rankCategorySuggestions, rulePatternOf } from "@/lib/category-suggestions";

describe("rankCategorySuggestions", () => {
  it("sums votes, drops unknown categories and keeps first-voted order on ties", () => {
    const votes = [
      { categoryId: 3, weight: 1 },
      { categoryId: 1, weight: 1 },
      { categoryId: 2, weight: 2 },
      { categoryId: 9, weight: 50 },
      { categoryId: 1, weight: 1 },
    ];
    expect(rankCategorySuggestions(votes, new Set([1, 2, 3]))).toEqual([1, 2, 3]);
    expect(rankCategorySuggestions(votes, new Set([1, 2, 3]), 1)).toEqual([1]);
  });

  it("uses the merchant-like start of a description as the rule pattern", () => {
    expect(rulePatternOf("ALDI CUL009 TIEL NLD")).toBe("ALDI");
    expect(rulePatternOf("X 123")).toBeNull();
  });
});

describe("getCategorySuggestions", () => {
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    migrateTestDb();
    await clearFixtures();
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const [food] = await db.insert(s.categories).values({ name: "T Food", budgetType: "nodig" }).returning();
    const [fun] = await db.insert(s.categories).values({ name: "T Fun", budgetType: "willen" }).returning();
    ids.food = food.id;
    ids.fun = fun.id;
    await db.insert(s.categoryRules).values({ categoryId: fun.id, namePattern: "cinema", nameWildcard: true });
    const tx = (description: string, categoryId: number | null, direction = "expense") => ({
      date: "2026-03-01",
      direction,
      type: "variabel",
      amount: 10,
      description,
      categoryId,
    });
    const rows = await db
      .insert(s.transactions)
      .values([
        tx("Lotus Bakery 12 Utrecht", null),
        tx("Lotus Bakery 99 Utrecht", ids.food),
        tx("Lotus Bakery 7 Utrecht", ids.food),
        tx("Lotus Bakery refund", ids.fun, "income"),
        tx("Cinema Lotus 3", null),
      ])
      .returning({ id: s.transactions.id });
    ids.picked = rows[0].id;
    ids.similarA = rows[1].id;
    ids.similarB = rows[2].id;
    ids.cinema = rows[4].id;
  });

  afterAll(() => removeTestDb());

  it("suggests the history's category and previews the rule's matches", async () => {
    const { getCategorySuggestions } = await import("@/lib/category-suggestions");
    const result = await getCategorySuggestions([ids.picked]);
    expect(result.suggested[0]).toBe(ids.food);
    expect(result.patterns).toEqual(["Lotus Bakery"]);
    expect(result.direction).toBe("expense");
    // The income refund has the other direction, so the rule wouldn't touch it.
    expect(result.similarIds.sort()).toEqual([ids.similarA, ids.similarB].sort());
  });

  it("puts a matching rule first", async () => {
    const { getCategorySuggestions } = await import("@/lib/category-suggestions");
    const result = await getCategorySuggestions([ids.cinema]);
    expect(result.suggested[0]).toBe(ids.fun);
  });
});

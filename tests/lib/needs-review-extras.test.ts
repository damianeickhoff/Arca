// Needs a category's three additions: Ask AI's picks kept on the transaction, a manual
// "Internal transfer" counting like a derived one, and leaving unticked matches out of
// a new rule's first run. Against a throwaway database (see tests/helpers/test-db.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateTestDb, clearFixtures, removeTestDb } from "../helpers/test-db";
import { withoutCategoryFor, type RulePassChange } from "@/lib/apply-rules";
import { aiPickOf } from "@/lib/category-suggestions";

const change = (id: number, patch: RulePassChange["patch"]): RulePassChange => ({
  id,
  date: "2026-03-01",
  description: "x",
  fromCategoryId: null,
  patch,
  before: { categoryId: null, recurringItemId: null, isReimbursement: false },
});

describe("withoutCategoryFor", () => {
  it("drops the category change of excluded rows and keeps their other changes", () => {
    const changes = [change(1, { categoryId: 5 }), change(2, { categoryId: 5, recurringItemId: 9 }), change(3, { categoryId: 5 })];
    const kept = withoutCategoryFor(changes, new Set([1, 2]));
    expect(kept.map((c) => c.id)).toEqual([2, 3]);
    expect(kept[0].patch).toEqual({ recurringItemId: 9 });
    expect(kept[1].patch).toEqual({ categoryId: 5 });
  });

  it("changes nothing without exclusions", () => {
    const changes = [change(1, { categoryId: 5 })];
    expect(withoutCategoryFor(changes, new Set())).toBe(changes);
  });
});

describe("aiPickOf", () => {
  const valid = new Set([1, 2]);
  it("returns the stored pick of one uncategorised transaction", () => {
    expect(aiPickOf([{ categoryId: null, aiSuggestedCategoryId: 2 }], valid)).toBe(2);
  });
  it("ignores categorised rows, several rows and categories that are gone", () => {
    expect(aiPickOf([{ categoryId: 1, aiSuggestedCategoryId: 2 }], valid)).toBeNull();
    expect(aiPickOf([{ categoryId: null, aiSuggestedCategoryId: 3 }], valid)).toBeNull();
    expect(
      aiPickOf(
        [
          { categoryId: null, aiSuggestedCategoryId: 2 },
          { categoryId: null, aiSuggestedCategoryId: 1 },
        ],
        valid,
      ),
    ).toBeNull();
  });
});

describe("database", () => {
  const ids: Record<string, number> = {};

  beforeAll(() => migrateTestDb());
  afterAll(() => removeTestDb());

  beforeEach(async () => {
    await clearFixtures();
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const [food] = await db.insert(s.categories).values({ name: "T Food", budgetType: "nodig" }).returning();
    const [fun] = await db.insert(s.categories).values({ name: "T Fun", budgetType: "willen" }).returning();
    ids.food = food.id;
    ids.fun = fun.id;
    const tx = (description: string) => ({ date: "2026-03-01", direction: "expense", type: "variabel", amount: 10, description, categoryId: null });
    const rows = await db.insert(s.transactions).values([tx("Bakery A"), tx("Bakery B"), tx("To savings")]).returning({ id: s.transactions.id });
    ids.a = rows[0].id;
    ids.b = rows[1].id;
    ids.transfer = rows[2].id;
  });

  it("has the ai_suggested_category_id column", async () => {
    const { db } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    const cols = db.all<{ name: string }>(sql.raw("PRAGMA table_info(transactions)")).map((c) => c.name);
    expect(cols).toContain("ai_suggested_category_id");
  });

  it("keeps the AI's answers and asks only for transactions without one", async () => {
    const { aiPicksFor, getStoredAiPicks } = await import("@/lib/ai-category-picks");
    const asked: number[][] = [];
    const ask = async (wanted: number[]) => {
      asked.push(wanted);
      return { ok: true as const, value: Object.fromEntries(wanted.map((id) => [id, ids.food])) as Record<number, number> };
    };

    const first = await aiPicksFor([ids.a], ask);
    expect(first).toEqual({ ok: true, value: { [ids.a]: ids.food } });
    expect(await getStoredAiPicks([ids.a, ids.b])).toEqual({ [ids.a]: ids.food });

    // A reload: the stored pick comes back without a request; only b is asked.
    const second = await aiPicksFor([ids.a, ids.b], ask);
    expect(second).toEqual({ ok: true, value: { [ids.a]: ids.food, [ids.b]: ids.food } });
    expect(asked).toEqual([[ids.a], [ids.b]]);

    // Everything known: no request at all.
    await aiPicksFor([ids.a, ids.b], ask);
    expect(asked).toHaveLength(2);
  });

  it("stores nothing when the AI fails", async () => {
    const { aiPicksFor, getStoredAiPicks } = await import("@/lib/ai-category-picks");
    const result = await aiPicksFor([ids.a], async () => ({ ok: false as const, error: "unavailable" as const }));
    expect(result.ok).toBe(false);
    expect(await getStoredAiPicks([ids.a])).toEqual({});
  });

  it("shows the stored pick in the suggestions until the transaction gets a category", async () => {
    const { storeAiPicks } = await import("@/lib/ai-category-picks");
    const { getCategorySuggestions } = await import("@/lib/category-suggestions");
    await storeAiPicks({ [ids.a]: ids.fun });
    expect((await getCategorySuggestions([ids.a])).aiPick).toBe(ids.fun);

    // A rule files it: the rule pass clears the pick.
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.insert(s.categoryRules).values({ categoryId: ids.food, namePattern: "Bakery A", nameWildcard: true });
    const { applyAllRules } = await import("@/lib/apply-rules");
    await applyAllRules();
    const [row] = await db.select().from(s.transactions).where(eq(s.transactions.id, ids.a));
    expect(row.categoryId).toBe(ids.food);
    expect(row.aiSuggestedCategoryId).toBeNull();
    expect((await getCategorySuggestions([ids.a])).aiPick).toBeNull();
  });

  it("takes a manually marked internal transfer out of Needs a category", async () => {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { getNeedsReviewTransactions } = await import("@/lib/needs-review");
    expect((await getNeedsReviewTransactions()).map((r) => r.id)).toContain(ids.transfer);
    await db.update(s.transactions).set({ isManualTransfer: true }).where(eq(s.transactions.id, ids.transfer));
    expect((await getNeedsReviewTransactions()).map((r) => r.id)).not.toContain(ids.transfer);
  });
});

describe("rules for several merchants", () => {
  it("makes one rule per merchant, with the direction its transactions share", async () => {
    const { ruleSpecsFor } = await import("@/lib/category-suggestions");
    const specs = ruleSpecsFor([
      { description: "ALDI CUL009 TIEL", direction: "expense" },
      { description: "aldi CUL010 UTRECHT", direction: "expense" },
      { description: "Lotus Bakery 12 Utrecht", direction: "expense" },
      { description: "Lotus Bakery 7 Utrecht", direction: "income" },
      { description: "X 1", direction: "expense" },
    ]);
    expect(specs).toEqual([
      { pattern: "ALDI", direction: "expense" },
      { pattern: "Lotus Bakery", direction: null },
    ]);
  });

  it("matches a description the way a contains rule does", async () => {
    const { matchesRuleSpec } = await import("@/lib/category-suggestions");
    expect(matchesRuleSpec({ description: " Albert ALDI 3 ", direction: "expense" }, { pattern: "aldi", direction: "expense" })).toBe(true);
    expect(matchesRuleSpec({ description: "ALDI 3", direction: "income" }, { pattern: "ALDI", direction: "expense" })).toBe(false);
    expect(matchesRuleSpec({ description: "ALDI 3", direction: "income" }, { pattern: "ALDI", direction: null })).toBe(true);
  });

  it("groups the matches per rule, each transaction once, newest first, without the skipped ones", async () => {
    const { groupMatchesByRule } = await import("@/lib/rule-match-groups");
    const row = (id: number, date: string) => ({ id, date, description: "d", amount: 1, direction: "expense", accountName: null });
    const groups = groupMatchesByRule(
      [
        [row(1, "2026-01-01"), row(2, "2026-02-01"), row(9, "2026-03-01")],
        [row(2, "2026-02-01"), row(3, "2026-01-15")],
      ],
      new Set([9]),
    );
    expect(groups.map((g) => g.map((r) => r.id))).toEqual([[2, 1], [3]]);
  });
});

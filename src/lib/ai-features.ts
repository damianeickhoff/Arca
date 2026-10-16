import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, categories, merchants, transactions } from "@/db/schema";
import { resolveDisplayName } from "@/lib/friendly-names";
import { generateJson, redactForAi, type AiResult } from "@/lib/gemini";
import { AI_CATEGORY_BATCH } from "@/lib/ai-shared";

// What the app asks Gemini for. Each feature builds the smallest prompt that does the job
// out of data that can't identify an account (see redactForAi), and checks the answer
// before anything uses it — a model can return ids that don't exist.

/** Suggested category per transaction id, for the ones the model could place. */
export async function suggestCategories(ids: number[]): Promise<AiResult<Record<number, number>>> {
  const wanted = ids.slice(0, AI_CATEGORY_BATCH);
  if (wanted.length === 0) return { ok: true, value: {} };

  const [rows, cats] = await Promise.all([
    db
      .select({
        id: transactions.id,
        description: transactions.description,
        customName: transactions.customName,
        merchantName: merchants.name,
        amount: transactions.amount,
        direction: transactions.direction,
      })
      .from(transactions)
      .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
      .where(inArray(transactions.id, wanted)),
    db.select({ id: categories.id, name: categories.name, group: categories.group, isGroup: categories.isGroup }).from(categories),
  ]);
  // Groups (Housing…) are never assigned; only real categories can be suggested.
  const assignable = cats.filter((c) => !c.isGroup);
  const validIds = new Set(assignable.map((c) => c.id));

  const kind = (group: string) => (group === "income" ? "income" : group === "savings" ? "savings" : "spending");
  const user = [
    "Categories (id | name | kind):",
    ...assignable.map((c) => `${c.id} | ${c.name} | ${kind(c.group)}`),
    "",
    "Transactions (id | text | money in or out | amount):",
    ...rows.map((r) => {
      const text = redactForAi([r.merchantName, resolveDisplayName(r)].filter(Boolean).join(" — "));
      return `${r.id} | ${text} | ${r.direction === "income" ? "in" : "out"} | ${r.amount.toFixed(2)}`;
    }),
  ].join("\n");

  const result = await generateJson<{ id: number; categoryId: number }[]>(
    {
      system:
        "You sort bank transactions of a household into its budgeting categories. For each transaction pick the single best category id from the list. Money in usually belongs to an income category, money out to spending or savings. Leave a transaction out when no category fits.",
      user,
    },
    {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { id: { type: "INTEGER" }, categoryId: { type: "INTEGER" } },
        required: ["id", "categoryId"],
      },
    },
  );
  if (!result.ok) return result;

  const asked = new Set(rows.map((r) => r.id));
  const value: Record<number, number> = {};
  for (const pick of Array.isArray(result.value) ? result.value : []) {
    if (asked.has(pick?.id) && validIds.has(pick?.categoryId)) value[pick.id] = pick.categoryId;
  }
  return { ok: true, value };
}

// ── Period summary ──────────────────────────────────────────────────────────

/** The figures the Insights overview already shows, as the summary's only input. */
export interface SummaryFacts {
  from: string;
  to: string;
  ongoing: boolean;
  income: number;
  expense: number;
  saved: number;
  /** Whole-percent change against the previous period of the same length, signed. */
  incomeChangePct: number | null;
  expenseChangePct: number | null;
  avgPerDay: number;
  categories: { name: string; spent: number; budget: number | null }[];
  merchants: { name: string; total: number; visits: number }[];
  largest: { name: string | null; amount: number; category: string | null } | null;
}

export interface PeriodSummary {
  text: string;
  /** ISO timestamp. */
  createdAt: string;
}

const SUMMARIES_KEY = "ai_summaries";
/** Summaries kept: one per period and filter set, newest first. */
const SUMMARIES_KEPT = 24;

async function readSummaries(): Promise<Record<string, PeriodSummary>> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SUMMARIES_KEY)).limit(1);
  try {
    const parsed = row?.value ? JSON.parse(row.value) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** The summary written earlier for this period and filter set, if any. */
export async function getCachedSummary(key: string): Promise<PeriodSummary | null> {
  return (await readSummaries())[key] ?? null;
}

/** Writes a fresh summary of `facts` in the user's language and keeps it under `key`. */
export async function summarizePeriod(key: string, facts: SummaryFacts, locale: string): Promise<AiResult<PeriodSummary>> {
  const language = locale === "nl" ? "Dutch" : "English";
  const clean: SummaryFacts = {
    ...facts,
    merchants: facts.merchants.slice(0, 6).map((m) => ({ ...m, name: redactForAi(m.name) })),
    categories: facts.categories.slice(0, 8),
    largest: facts.largest ? { ...facts.largest, name: facts.largest.name ? redactForAi(facts.largest.name) : null } : null,
  };

  const result = await generateJson<{ summary: string }>(
    {
      system: `You write a short, friendly summary of a household's spending for one period, in ${language}, addressing the reader as "you". Three or four sentences, plain text, no lists or markdown. Mention what stands out (the biggest categories, anything over budget, big changes against the previous period) and end with one practical suggestion. Use only the figures given; amounts are in euros. ${facts.ongoing ? "The period is still running, so totals are not final." : ""}`,
      user: JSON.stringify(clean),
    },
    { type: "OBJECT", properties: { summary: { type: "STRING" } }, required: ["summary"] },
  );
  if (!result.ok) return result;
  const text = typeof result.value?.summary === "string" ? result.value.summary.trim() : "";
  if (!text) return { ok: false, error: "badResponse" };

  const summary: PeriodSummary = { text, createdAt: new Date().toISOString() };
  const all = await readSummaries();
  const kept = Object.entries({ ...all, [key]: summary })
    .sort(([, a], [, z]) => z.createdAt.localeCompare(a.createdAt))
    .slice(0, SUMMARIES_KEPT);
  const value = JSON.stringify(Object.fromEntries(kept));
  await db.insert(appSettings).values({ key: SUMMARIES_KEY, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
  return { ok: true, value: summary };
}

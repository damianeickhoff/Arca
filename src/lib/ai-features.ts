import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, categories, merchants, transactions } from "@/db/schema";
import { resolveDisplayName } from "@/lib/friendly-names";
import { generateJson, type AiResult } from "@/lib/ai-provider";
import { redactForAi } from "@/lib/ai-schema";
import { AI_CATEGORY_BATCH } from "@/lib/ai-shared";
import { formatEur } from "@/lib/format";
import { toPeriodSummary, type PeriodSummary, type SummaryFacts } from "@/lib/period-facts";

export type { PeriodSummary, SummaryFacts };

// What the app asks the AI provider (Gemini or a local server) for. Each feature builds
// the smallest prompt that does the job out of data that can't identify an account (see
// redactForAi), and checks the answer before anything uses it — a model can return ids
// that don't exist.

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

const SUMMARIES_KEY = "ai_summaries";
/** Summaries kept: one per period and filter set, newest first. */
const SUMMARIES_KEPT = 24;

/** Kept summaries that have the structured shape; paragraph summaries from before are
 *  skipped (and dropped for good on the next write). */
async function readSummaries(): Promise<Record<string, PeriodSummary>> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SUMMARIES_KEY)).limit(1);
  try {
    const parsed = row?.value ? JSON.parse(row.value) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const kept: Record<string, PeriodSummary> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, { createdAt?: unknown } | null>)) {
      const summary = typeof value?.createdAt === "string" ? toPeriodSummary(value, value.createdAt) : null;
      if (summary) kept[key] = summary;
    }
    return kept;
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
  // Amounts go in already formatted, so the facts quote them exactly as the page does.
  const money = (v: number) => formatEur(v);
  const input = {
    period: { from: facts.from, to: facts.to, stillRunning: facts.ongoing },
    income: money(facts.income),
    spent: money(facts.expense),
    saved: money(facts.saved),
    incomeChangePct: facts.incomeChangePct,
    spentChangePct: facts.expenseChangePct,
    spentPerDay: money(facts.avgPerDay),
    lastPeriodSpentPerDay: facts.prevAvgPerDay != null ? money(facts.prevAvgPerDay) : null,
    leftToSpend: facts.left
      ? { afterBillsStillDue: money(facts.left.amount), daysLeft: facts.left.daysLeft, perDay: money(facts.left.perDay) }
      : null,
    biggestGroup: facts.biggestGroup ? { name: facts.biggestGroup.name, spent: money(facts.biggestGroup.spent) } : null,
    topMerchant: facts.topMerchant
      ? { name: redactForAi(facts.topMerchant.name), spent: money(facts.topMerchant.total), visits: facts.topMerchant.visits }
      : null,
    other: { spent: money(facts.other.amount), sharePct: facts.other.sharePct, transactionsWithoutCategory: facts.other.transactions },
    categories: facts.categories.slice(0, 8).map((c) => ({ name: c.name, spent: money(c.spent), budget: c.budget != null ? money(c.budget) : null })),
    merchants: facts.merchants.slice(0, 6).map((m) => ({ name: redactForAi(m.name), spent: money(m.total), visits: m.visits })),
    largestExpense: facts.largest
      ? { name: facts.largest.name ? redactForAi(facts.largest.name) : null, amount: money(facts.largest.amount), category: facts.largest.category }
      : null,
  };

  const result = await generateJson<unknown>(
    {
      system: [
        `You sum up one period of a household's spending, in ${language}, addressing the reader as "you". Plain text, no markdown.`,
        "headline: one sentence of at most 15 words on the main thing that stands out.",
        "facts: exactly three short sentences, each built on figures from the input: the balance of spending and income, the biggest group or merchant, and what is still in Other (or a big change against last period when Other is small). Quote amounts exactly as they are written in the input.",
        facts.left
          ? "tip: one or two sentences of practical budgeting advice built on leftToSpend (what is left after the bills still due, the days left and the amount per day), compared with last period's spending per day."
          : "tip: one or two sentences of practical budgeting advice for the next period, based on these figures.",
        "Use only the figures given; never invent or recalculate numbers.",
        facts.ongoing ? "The period is still running, so totals are not final." : "",
      ]
        .filter(Boolean)
        .join(" "),
      user: JSON.stringify(input),
    },
    {
      type: "OBJECT",
      properties: {
        headline: { type: "STRING" },
        facts: { type: "ARRAY", items: { type: "STRING" }, minItems: 3, maxItems: 3 },
        tip: { type: "STRING" },
      },
      required: ["headline", "facts", "tip"],
    },
  );
  if (!result.ok) return result;
  const summary = toPeriodSummary(result.value, new Date().toISOString());
  if (!summary) return { ok: false, error: "badResponse" };

  const all = await readSummaries();
  const kept = Object.entries({ ...all, [key]: summary })
    .sort(([, a], [, z]) => z.createdAt.localeCompare(a.createdAt))
    .slice(0, SUMMARIES_KEPT);
  const value = JSON.stringify(Object.fromEntries(kept));
  await db.insert(appSettings).values({ key: SUMMARIES_KEY, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
  return { ok: true, value: summary };
}

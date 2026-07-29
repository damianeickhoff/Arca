import { db } from "@/db";
import { categories } from "@/db/schema";
import { asc } from "drizzle-orm";
import { RecurringAddClient, type RecurringAddPrefill } from "./recurring-add-client";

export const dynamic = "force-dynamic";

const PREFILL_KEYS = ["name", "type", "amount", "budgetType", "dueDay", "matchPattern", "matchAmount", "categoryId"] as const;

export default async function AddRecurringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [cats, params] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.name)),
    searchParams,
  ]);

  // "Make recurring" on a transaction links here with the fields it can derive (see
  // buildRecurringPrefill in transaction-detail-dialog.tsx). Only known keys are read,
  // and only as single strings — a repeated param would otherwise arrive as an array.
  const prefill: RecurringAddPrefill = {};
  for (const key of PREFILL_KEYS) {
    const value = params[key];
    if (typeof value === "string" && value) prefill[key] = value;
  }

  return <RecurringAddClient categories={cats} prefill={Object.keys(prefill).length > 0 ? prefill : undefined} />;
}

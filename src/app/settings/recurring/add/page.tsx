import { db } from "@/db";
import { categories } from "@/db/schema";
import { asc } from "drizzle-orm";
import { RecurringAddClient } from "./recurring-add-client";

export const dynamic = "force-dynamic";

export default async function AddRecurringPage() {
  const cats = await db.select().from(categories).orderBy(asc(categories.name));
  return <RecurringAddClient categories={cats} />;
}

import { db } from "@/db";
import { recurringItems } from "@/db/schema";
import { sql } from "drizzle-orm";
import type { RecurringItem } from "@/db/schema";

// Case/whitespace-insensitive "does a recurring item with this name already exist"
// check, used to stop both manual creation (api/recurring) and the debt-driven
// auto-create-a-bill flow (api/debts) from silently creating duplicates. Matches
// dismissed rows too — same precedent as the recurring detector, which never suggests a
// series a dismissed item already covers (lib/recurring-suggestions.ts).
export async function findRecurringItemByName(name: string): Promise<RecurringItem | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const [row] = await db
    .select()
    .from(recurringItems)
    .where(sql`lower(trim(${recurringItems.name})) = lower(${trimmed})`)
    .limit(1);
  return row ?? null;
}

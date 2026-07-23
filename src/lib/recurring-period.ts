import { db } from "@/db";
import { recurringItems } from "@/db/schema";
import { and, eq, isNotNull, lt } from "drizzle-orm";

// Auto-disable recurring items whose end date has passed. Called lazily wherever the
// recurring list is loaded (cheap UPDATE, no-op once nothing is expired), so an item
// with a period end stops counting/showing as active on its own — no cron needed.
export async function disableExpiredRecurring() {
  const today = new Date().toISOString().slice(0, 10);
  await db
    .update(recurringItems)
    .set({ active: false })
    .where(and(eq(recurringItems.active, true), isNotNull(recurringItems.endDate), lt(recurringItems.endDate, today)));
}

import { db } from "@/db";
import { recurringItems } from "@/db/schema";
import { and, eq, gt, gte, isNotNull, isNull, lt, lte, or } from "drizzle-orm";

/**
 * Keep recurring items' lifecycle in step with their start/end dates. Called lazily
 * wherever the recurring list is loaded (cheap no-op UPDATEs once nothing changed), so no
 * cron is needed:
 *   1. Deactivate items that haven't started yet (future) or have already ended (expired).
 *   2. Reactivate date-bound items that are back inside their period — so a future item
 *      flips on by itself once its start date arrives — unless the user paused them.
 * Items without any start/end date keep their manual active flag untouched. Ended items
 * are kept (Settings › Recurring lists them under Archived, with their charges).
 */
export async function syncRecurringLifecycle() {
  const today = new Date().toISOString().slice(0, 10);

  // 1a. Deactivate not-yet-started (future) items.
  await db
    .update(recurringItems)
    .set({ active: false })
    .where(and(eq(recurringItems.active, true), isNotNull(recurringItems.startDate), gt(recurringItems.startDate, today)));

  // 1b. Deactivate ended (expired) items.
  await db
    .update(recurringItems)
    .set({ active: false })
    .where(and(eq(recurringItems.active, true), isNotNull(recurringItems.endDate), lt(recurringItems.endDate, today)));

  // 2. Reactivate date-bound, non-dismissed, non-paused items that are back inside their period.
  await db
    .update(recurringItems)
    .set({ active: true })
    .where(
      and(
        eq(recurringItems.active, false),
        eq(recurringItems.dismissed, false),
        eq(recurringItems.paused, false),
        or(isNull(recurringItems.startDate), lte(recurringItems.startDate, today)),
        or(isNull(recurringItems.endDate), gte(recurringItems.endDate, today)),
        or(isNotNull(recurringItems.startDate), isNotNull(recurringItems.endDate)),
      ),
    );
}

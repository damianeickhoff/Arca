import { db } from "@/db";
import { recurringItems } from "@/db/schema";
import { and, eq, gt, gte, isNotNull, isNull, lt, lte, or } from "drizzle-orm";

function isoDaysFromNow(monthDelta: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthDelta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Keep recurring items' lifecycle in step with their start/end dates. Called lazily
 * wherever the recurring list is loaded (cheap no-op UPDATEs once nothing changed), so no
 * cron is needed:
 *   1. Hard-delete bills whose end date is more than 2 months in the past.
 *   2. Deactivate items that haven't started yet (future) or have already ended (expired).
 *   3. Reactivate date-bound items that are back inside their period — so a future item
 *      flips on by itself once its start date arrives.
 * Items without any start/end date keep their manual active flag untouched.
 */
export async function syncRecurringLifecycle() {
  const today = new Date().toISOString().slice(0, 10);
  const twoMonthsAgo = isoDaysFromNow(-2);

  // 1. Auto-delete long-expired bills (ended > 2 months ago).
  await db.delete(recurringItems).where(and(isNotNull(recurringItems.endDate), lt(recurringItems.endDate, twoMonthsAgo)));

  // 2a. Deactivate not-yet-started (future) items.
  await db
    .update(recurringItems)
    .set({ active: false })
    .where(and(eq(recurringItems.active, true), isNotNull(recurringItems.startDate), gt(recurringItems.startDate, today)));

  // 2b. Deactivate ended (expired) items.
  await db
    .update(recurringItems)
    .set({ active: false })
    .where(and(eq(recurringItems.active, true), isNotNull(recurringItems.endDate), lt(recurringItems.endDate, today)));

  // 3. Reactivate date-bound, non-dismissed items that are back inside their period.
  await db
    .update(recurringItems)
    .set({ active: true })
    .where(
      and(
        eq(recurringItems.active, false),
        eq(recurringItems.dismissed, false),
        or(isNull(recurringItems.startDate), lte(recurringItems.startDate, today)),
        or(isNull(recurringItems.endDate), gte(recurringItems.endDate, today)),
        or(isNotNull(recurringItems.startDate), isNotNull(recurringItems.endDate)),
      ),
    );
}

/** @deprecated use {@link syncRecurringLifecycle} — kept as a thin alias for older call sites. */
export const disableExpiredRecurring = syncRecurringLifecycle;

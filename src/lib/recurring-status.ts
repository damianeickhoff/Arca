// Pure, client-safe period status for a recurring item, derived from its start/end dates.
// "future"  = starts after today (not active yet)
// "expired" = ended before today (no longer active)
// "active"  = currently within its period (or has no bounding dates)
export type RecurringPeriodStatus = "future" | "active" | "expired";

export function recurringPeriodStatus(
  item: { startDate?: string | null; endDate?: string | null },
  todayStr: string = new Date().toISOString().slice(0, 10),
): RecurringPeriodStatus {
  if (item.startDate && item.startDate > todayStr) return "future";
  if (item.endDate && item.endDate < todayStr) return "expired";
  return "active";
}

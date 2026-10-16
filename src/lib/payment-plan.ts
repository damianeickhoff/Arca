import { nextOccurrence, type OccurrenceItem } from "@/lib/recurring-occurrence";

// Payment plans: a one-off cost paid off in parts (recurring items of type "plan").
// Pure date and money maths only, so the editor, list rows and server code share it.
// The plan is stored as an ordinary recurrence — `amount` is one part, `endDate` the
// last part — so everything that already projects recurring bills handles it as is.

export const PLAN_MIN_PARTS = 2;
export const PLAN_MAX_PARTS = 60;

/** One part of `total` split over `parts`, rounded to cents (the last part absorbs the cent of rounding). */
export function planPartAmount(total: number, parts: number): number {
  return Math.round((total / parts) * 100) / 100;
}

/** The due dates of every part, starting on `startDate` and stepping by the frequency. */
export function planSchedule(startDate: string, frequency: string, parts: number): string[] {
  const item: OccurrenceItem = { frequency, startDate, dueDay: Number(startDate.slice(8, 10)) || 1 };
  const dates = [startDate];
  while (dates.length < parts) {
    const next = nextOccurrence(item, dates[dates.length - 1]);
    if (!next) break;
    dates.push(next);
  }
  return dates;
}

/** Which part (1-based) falls on `date`, or null when the date isn't one of the plan's parts. */
export function planPartNumber(
  item: { type: string; frequency: string; startDate: string | null; planParts: number | null },
  date: string,
): number | null {
  if (item.type !== "plan" || !item.startDate || !item.planParts) return null;
  const index = planSchedule(item.startDate, item.frequency, item.planParts).indexOf(date);
  return index === -1 ? null : index + 1;
}

export interface PlanProgress {
  paidParts: number;
  paidAmount: number;
  /** What is still to pay: the total minus what's paid, never below zero. */
  remaining: number;
}

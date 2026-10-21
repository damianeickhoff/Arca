import { shiftDate } from "@/lib/date-range";

// Pure due-date math for a recurring item — no db, so client components (the
// transaction sheet's recurrence card) can use it. Two views of the same rules:
// occurrencesBetween (every date in a range: the forecast, the bill tracker) and
// nextOccurrence (the single next date). Month-based frequencies clamp their anchor day
// to the length of each month; weekly and four-weekly walk forward from the start date
// in steps of 7 or 28 days, so the weekday is preserved.

export type OccurrenceItem = {
  frequency: string;
  dueDay?: number | null;
  startDate?: string | null;
  endDate?: string | null;
};

export const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  four_weekly: "Every four weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  once: "One-off",
};

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Days between occurrences for the frequencies that step by days, else null. */
function dayStep(frequency: string): number | null {
  return frequency === "weekly" ? 7 : frequency === "four_weekly" ? 28 : null;
}

/** Months between occurrences for the month-based frequencies. */
function monthStep(frequency: string): number {
  return frequency === "quarterly" ? 3 : frequency === "yearly" ? 12 : 1;
}

/**
 * Every date this item is due within [from, to], respecting its own start/end period.
 * Month-based frequencies clamp their anchor day to the length of each month (a 31st
 * bill falls on the 30th in April).
 */
export function occurrencesBetween(item: OccurrenceItem, from: string, to: string): string[] {
  const start = item.startDate && item.startDate > from ? item.startDate : from;
  const end = item.endDate && item.endDate < to ? item.endDate : to;
  if (start > end) return [];

  const dates: string[] = [];
  const push = (date: string) => {
    if (date >= start && date <= end) dates.push(date);
  };
  const step = dayStep(item.frequency);

  if (item.frequency === "once") {
    if (item.startDate) push(item.startDate);
  } else if (item.frequency === "daily") {
    for (let cursor = start; cursor <= end; cursor = shiftDate(cursor, 1)) push(cursor);
  } else if (step != null) {
    // Walk forward from the anchor (the item's own start date when it has one, so
    // the weekday is preserved) rather than from `start`.
    let cursor = item.startDate ?? start;
    while (cursor < start) cursor = shiftDate(cursor, step);
    for (; cursor <= end; cursor = shiftDate(cursor, step)) push(cursor);
  } else {
    const months = monthStep(item.frequency);
    const anchorDay = item.dueDay ?? (item.startDate ? Number(item.startDate.slice(8, 10)) : 1);
    // For multi-month steps the anchor month matters (a quarterly bill starting in
    // February is due Feb/May/Aug/Nov); monthly items are due every month regardless.
    const anchorMonth = item.startDate ? Number(item.startDate.slice(5, 7)) : 1;
    const anchorYear = item.startDate ? Number(item.startDate.slice(0, 4)) : Number(from.slice(0, 4));

    let year = Number(from.slice(0, 4));
    let month = Number(from.slice(5, 7));
    if (months > 1) {
      // Snap to the first anchor-aligned month at or after `from`.
      const fromIndex = year * 12 + (month - 1);
      const anchorIndex = anchorYear * 12 + (anchorMonth - 1);
      const stepsAhead = Math.max(0, Math.ceil((fromIndex - anchorIndex) / months));
      const index = anchorIndex + stepsAhead * months;
      year = Math.floor(index / 12);
      month = (index % 12) + 1;
    }

    while (iso(year, month, 1) <= end) {
      push(iso(year, month, Math.min(anchorDay, daysInMonth(year, month))));
      month += months;
      while (month > 12) {
        month -= 12;
        year += 1;
      }
    }
  }
  return dates;
}

/**
 * The first date this item is due strictly after `after` (defaults to today), or null
 * when it has already ended / has no further occurrence.
 */
export function nextOccurrence(item: OccurrenceItem, after?: string): string | null {
  const from = shiftDate(after ?? new Date().toISOString().slice(0, 10), 1);
  const start = item.startDate && item.startDate > from ? item.startDate : from;
  const withinPeriod = (date: string) => (!item.endDate || date <= item.endDate) && date >= start;

  switch (item.frequency) {
    case "once":
      return item.startDate && item.startDate >= from ? item.startDate : null;
    case "daily":
      return withinPeriod(start) ? start : null;
    case "weekly":
    case "four_weekly": {
      // Anchored on the start date so the weekday is preserved; without one there's
      // nothing to anchor to, so the next occurrence is simply the next day.
      const days = dayStep(item.frequency)!;
      let cursor = item.startDate ?? start;
      while (cursor < start) cursor = shiftDate(cursor, days);
      return withinPeriod(cursor) ? cursor : null;
    }
    default: {
      const step = monthStep(item.frequency);
      const anchorDay = item.dueDay ?? (item.startDate ? Number(item.startDate.slice(8, 10)) : 1);
      const anchorMonth = item.startDate ? Number(item.startDate.slice(5, 7)) : 1;
      const anchorYear = item.startDate ? Number(item.startDate.slice(0, 4)) : Number(start.slice(0, 4));

      let year = Number(start.slice(0, 4));
      let month = Number(start.slice(5, 7));
      if (step > 1) {
        // Snap to the first anchor-aligned month at or after `start`.
        const startIndex = year * 12 + (month - 1);
        const anchorIndex = anchorYear * 12 + (anchorMonth - 1);
        const stepsAhead = Math.max(0, Math.ceil((startIndex - anchorIndex) / step));
        const index = anchorIndex + stepsAhead * step;
        year = Math.floor(index / 12);
        month = (index % 12) + 1;
      }

      // At most two steps: the anchor day may already have passed in the first
      // candidate month, in which case the following interval is the answer.
      for (let i = 0; i < 2; i++) {
        const date = iso(year, month, Math.min(anchorDay, daysInMonth(year, month)));
        if (date >= start) return withinPeriod(date) ? date : null;
        month += step;
        while (month > 12) { month -= 12; year += 1; }
      }
      return null;
    }
  }
}

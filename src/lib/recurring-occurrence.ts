import { shiftDate } from "@/lib/date-range";

// Pure next-due-date math for a single recurring item — no db, so client components
// (the transaction sheet's recurrence card) can use it. The forecast has its own
// range-based generator (occurrencesFor in cash-flow-forecast.ts); this is the
// single-date version of the same rules: month-based frequencies clamp their anchor
// day to the length of each month, weekly walks forward from the start date so the
// weekday is preserved.

export type OccurrenceItem = {
  frequency: string;
  dueDay?: number | null;
  startDate?: string | null;
  endDate?: string | null;
};

export const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
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
    case "weekly": {
      // Anchored on the start date so the weekday is preserved; without one there's
      // nothing to anchor to, so the next occurrence is simply the next day.
      let cursor = item.startDate ?? start;
      while (cursor < start) cursor = shiftDate(cursor, 7);
      return withinPeriod(cursor) ? cursor : null;
    }
    default: {
      const step = item.frequency === "quarterly" ? 3 : item.frequency === "yearly" ? 12 : 1;
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

import type { ActivitySpendChart } from "./context";

const DAY = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((toTime(b) - toTime(a)) / DAY);

/**
 * Builds the hero's chart for the financial month from the money that went out (already
 * split-allocated by the page) and the bills still due: one bar a day, bills only after
 * today.
 */
export function buildSpendChart({
  start,
  end,
  today,
  spending,
  scheduled,
}: {
  start: string;
  end: string;
  today: string;
  spending: { date: string; amount: number }[];
  scheduled: { date: string; amount: number }[];
}): ActivitySpendChart {
  if (end < start) end = start;
  const bars = Array.from({ length: daysBetween(start, end) + 1 }, (_, i) => ({ from: toIso(toTime(start) + i * DAY), spent: 0, scheduled: 0 }));

  for (const s of spending) {
    if (s.date < start || s.date > end) continue;
    bars[daysBetween(start, s.date)].spent += s.amount;
  }
  let scheduledTotal = 0;
  for (const s of scheduled) {
    if (s.date <= today || s.date < start || s.date > end) continue;
    bars[daysBetween(start, s.date)].scheduled += s.amount;
    scheduledTotal += s.amount;
  }

  const spent = bars.reduce((sum, b) => sum + b.spent, 0);
  const elapsed = today < start ? 0 : daysBetween(start, today < end ? today : end) + 1;

  return {
    bars,
    todayIndex: today >= start && today < end ? daysBetween(start, today) : null,
    scheduledTotal,
    perDay: elapsed > 0 ? spent / elapsed : 0,
    start,
    end,
  };
}

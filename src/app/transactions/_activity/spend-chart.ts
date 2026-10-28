import type { ActivitySpendChart } from "./context";

const DAY = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((toTime(b) - toTime(a)) / DAY);

/**
 * Builds the period hero's chart from the money that went out (already filtered and
 * split-allocated by the page) and the bills still due. Up to two months is one bar a
 * day; up to a year one a week; longer periods one a month. Bills only count after today.
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
  const span = daysBetween(start, end) + 1;
  const unit: ActivitySpendChart["unit"] = span <= 62 ? "day" : span <= 366 ? "week" : "month";

  const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
  const indexOf = (iso: string) =>
    unit === "day" ? daysBetween(start, iso) : unit === "week" ? Math.floor(daysBetween(start, iso) / 7) : monthIndex(iso) - monthIndex(start);

  const bars = Array.from({ length: indexOf(end) + 1 }, (_, i) => {
    if (unit !== "month") return { from: toIso(toTime(start) + i * (unit === "day" ? 1 : 7) * DAY), spent: 0, scheduled: 0 };
    const m = monthIndex(start) + i;
    const from = i === 0 ? start : `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}-01`;
    return { from, spent: 0, scheduled: 0 };
  });

  for (const s of spending) {
    if (s.date < start || s.date > end) continue;
    bars[indexOf(s.date)].spent += s.amount;
  }
  let scheduledTotal = 0;
  for (const s of scheduled) {
    if (s.date <= today || s.date < start || s.date > end) continue;
    bars[indexOf(s.date)].scheduled += s.amount;
    scheduledTotal += s.amount;
  }

  const spent = bars.reduce((sum, b) => sum + b.spent, 0);
  const elapsed = today < start ? 0 : daysBetween(start, today < end ? today : end) + 1;

  return {
    unit,
    bars,
    todayIndex: today >= start && today < end ? indexOf(today) : null,
    scheduledTotal,
    perDay: elapsed > 0 ? spent / elapsed : 0,
    start,
    end,
  };
}

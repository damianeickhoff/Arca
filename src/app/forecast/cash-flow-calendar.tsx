import { formatEur } from "@/lib/format";
import type { ForecastPoint } from "@/lib/cash-flow-forecast-shared";

// Month grids across the forecast horizon, tinted by each day's net movement — the
// "when does it land" view the line chart can't give at a glance. Tint strength scales
// with the day's change relative to the biggest one in the horizon, so the heaviest
// days stand out without needing a legend. Green/red match the income/expense colors
// used by every other chart on this tab.

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function CashFlowCalendar({ points }: { points: ForecastPoint[] }) {
  const moving = points.filter((p) => p.change !== 0);
  if (moving.length === 0) return null;

  const peak = Math.max(...moving.map((p) => Math.abs(p.change)));
  const changeByDate = new Map(points.map((p) => [p.date, p.change]));

  // One grid per calendar month the horizon touches.
  const months: { year: number; month: number }[] = [];
  for (const point of points) {
    const year = Number(point.date.slice(0, 4));
    const month = Number(point.date.slice(5, 7));
    if (!months.some((m) => m.year === year && m.month === month)) months.push({ year, month });
  }

  return (
    <div className="space-y-4">
      {months.map(({ year, month }) => {
        const dayCount = new Date(year, month, 0).getDate();
        // Monday-first offset for the 1st of the month.
        const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7;

        return (
          <div key={`${year}-${month}`}>
            <p className="text-xs font-medium text-foreground/60 mb-2">{monthLabel(year, month)}</p>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((day, i) => (
                <span key={i} className="text-xs text-foreground/30 text-center">{day}</span>
              ))}
              {Array.from({ length: lead }, (_, i) => <span key={`pad-${i}`} />)}
              {Array.from({ length: dayCount }, (_, i) => {
                const day = i + 1;
                const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const change = changeByDate.get(date) ?? 0;
                const intensity = change === 0 ? 0 : 0.2 + 0.8 * (Math.abs(change) / peak);
                const color = change >= 0 ? "var(--color-income)" : "var(--color-expense)";

                return (
                  <span
                    key={date}
                    title={change !== 0 ? `${change >= 0 ? "+" : "−"}${formatEur(Math.abs(change))}` : undefined}
                    className="aspect-square rounded-lg flex items-center justify-center text-xs tabular-nums"
                    style={
                      change === 0
                        ? { backgroundColor: "color-mix(in srgb, currentColor 6%, transparent)", opacity: 0.4 }
                        : { backgroundColor: `color-mix(in srgb, ${color} ${Math.round(intensity * 100)}%, transparent)` }
                    }
                  >
                    {day}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

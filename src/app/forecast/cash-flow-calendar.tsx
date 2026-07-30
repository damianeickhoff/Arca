import { formatEur } from "@/lib/format";
import type { ForecastPoint } from "@/lib/cash-flow-forecast-shared";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

export function CashFlowCalendar({
  points,
  month,
}: {
  points: ForecastPoint[];
  month: string;
}) {
  const moving = points.filter((p) => p.change !== 0);
  if (moving.length === 0) return null;

  const peak = Math.max(...moving.map((p) => Math.abs(p.change)));
  const changeByDate = new Map(points.map((p) => [p.date, p.change]));

  const [year, monthNumber] = month.split("-").map(Number);
  const dayCount = new Date(year, monthNumber, 0).getDate();
  const lead = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;

  return (
    <div>
      <p className="text-xs font-medium text-foreground/60 mb-2">
        {monthLabel(year, monthNumber)}
      </p>

      <div className="grid grid-cols-7 gap-1 w-full">
      {WEEKDAYS.map((day, index) => (
        <span key={index} className="text-[10px] text-foreground/30 text-center">
          {day}
        </span>
      ))}

        {Array.from({ length: lead }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}

        {Array.from({ length: dayCount }, (_, i) => {
          const day = i + 1;
          const date = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const change = changeByDate.get(date) ?? 0;
          const intensity = change === 0 ? 0 : 0.2 + 0.8 * (Math.abs(change) / peak);
          const color = change >= 0 ? "var(--color-income)" : "var(--color-expense)";

          return (
            <span
              key={date}
              title={change !== 0 ? `${change >= 0 ? "+" : "−"}${formatEur(Math.abs(change))}` : undefined}
              className="aspect-square min-w-0 rounded-md flex items-center justify-center text-xs tabular-nums"
              style={
                change === 0
                  ? {
                      backgroundColor: "color-mix(in srgb, currentColor 6%, transparent)",
                      opacity: 0.4,
                    }
                  : {
                      backgroundColor: `color-mix(in srgb, ${color} ${Math.round(intensity * 100)}%, transparent)`,
                    }
              }
            >
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}
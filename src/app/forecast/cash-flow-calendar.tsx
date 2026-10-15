import { useLocale } from "next-intl";
import { formatEur } from "@/lib/format";
import type { ForecastPoint } from "@/lib/cash-flow-forecast-shared";

function monthLabel(year: number, month: number, locale: string) {
  return new Date(year, month - 1, 1).toLocaleDateString(locale === "nl" ? "nl-NL" : "en-GB", {
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
  const locale = useLocale();
  const weekdays = [1, 2, 3, 4, 5, 6, 7].map((d) => new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2024, 0, d)));
  const moving = points.filter((p) => p.change !== 0);
  if (moving.length === 0) return null;

  const peak = Math.max(...moving.map((p) => Math.abs(p.change)));
  const changeByDate = new Map(points.map((p) => [p.date, p.change]));

  const [year, monthNumber] = month.split("-").map(Number);
  const dayCount = new Date(year, monthNumber, 0).getDate();
  const lead = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;

  return (
    <div>
      <p className="mono-label mb-2 text-[10px]">
        {monthLabel(year, monthNumber, locale)}
      </p>

      <div className="grid grid-cols-7 gap-1 w-full">
      {weekdays.map((day, index) => (
        <span key={index} className="text-center font-mono text-[10px] uppercase text-ink-3">
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
          const color = change >= 0 ? "var(--arca-positive)" : "var(--arca-negative)";

          return (
            <span
              key={date}
              title={change !== 0 ? `${change >= 0 ? "+" : "−"}${formatEur(Math.abs(change))}` : undefined}
              className="flex aspect-square min-w-0 items-center justify-center rounded-tile font-mono text-[11px] tabular-nums text-ink"
              style={
                change === 0
                  ? {
                      backgroundColor: "var(--arca-surface-2)",
                      color: "var(--arca-ink-3)",
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
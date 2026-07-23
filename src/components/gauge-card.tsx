const eur0 = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
function money(n: number) {
  return eur0.format(Math.round(n)).replace(/\s/g, "");
}

/** Semicircular gauge — track + color fill, big centred amount. Lifted from the
 *  Budget portal's gauge so every "progress toward a total" card (budget, savings,
 *  debts) looks and behaves identically. */
export function Gauge({ pct, left, over }: { pct: number; left: number; over: boolean }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = over ? "var(--danger)" : clamped >= 80 ? "#f97316" : clamped >= 60 ? "#f59e0b" : "var(--success)";
  return (
    <div className="relative w-full">
      <svg viewBox="0 0 100 55" className="w-full">
        <path d="M 6 50 A 44 44 0 0 1 94 50" fill="none" stroke="white" strokeOpacity="0.1" strokeWidth="3" strokeLinecap="round" pathLength={100} />
        {/* A zero-length dash (clamped === 0) still paints a round-linecap dot at both
            ends of the path in some browsers, so skip the colored path entirely then —
            otherwise "0% used" shows two stray dots instead of just the gray track. */}
        {clamped > 0 && (
          <path
            d="M 6 50 A 44 44 0 0 1 94 50"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${clamped} 100`}
            style={{ transition: "stroke-dasharray 500ms ease" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
        <p className="text-sm text-foreground/60">{over ? "Over" : "Left"}</p>
        <p className="text-4xl font-semibold tabular-nums tracking-tight">{money(Math.abs(left))}</p>
        <p className="text-sm font-medium tabular-nums" style={{ color }}>{Math.round(clamped)}% used</p>
      </div>
    </div>
  );
}

export interface GaugeCardProps {
  topLeftLabel: string;
  topLeftValue: string;
  topRightLabel: string;
  topRightValue: string;
  pct: number;
  left: number;
  over: boolean;
  bottomLeftLabel: string;
  bottomLeftValue: string;
  bottomRightLabel: string;
  bottomRightValue: string;
}

/** The Budget portal's saved-overview gauge card, generalized so the Savings and
 *  Debts pages can reuse the exact same styling/behaviour with their own numbers. */
export function GaugeCard({
  topLeftLabel,
  topLeftValue,
  topRightLabel,
  topRightValue,
  pct,
  left,
  over,
  bottomLeftLabel,
  bottomLeftValue,
  bottomRightLabel,
  bottomRightValue,
}: GaugeCardProps) {
  return (
    <div className="rounded-2xl bg-none p-5">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm text-foreground/60">{topLeftLabel}</p>
          <p className="font-semibold">{topLeftValue}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-foreground/60">{topRightLabel}</p>
          <p className="font-semibold">{topRightValue}</p>
        </div>
      </div>

      <Gauge pct={pct} left={left} over={over} />

      <div className="flex items-end justify-between mt-2">
        <div>
          <p className="text-sm text-foreground/60">{bottomLeftLabel}</p>
          <p className="font-semibold tabular-nums">{bottomLeftValue}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-foreground/60">{bottomRightLabel}</p>
          <p className="font-semibold tabular-nums">{bottomRightValue}</p>
        </div>
      </div>
    </div>
  );
}

export { money as formatGaugeMoney };

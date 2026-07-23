"use client";

// Shared full-circle progress ring drawn behind an icon — used by the dashboard's
// "Spending by category" cards as well as the budget/savings/debt row icons, so all
// "progress toward a total" rings look and behave identically. Colored in the item's
// own color; the track is a darkened shade of that same color (rather than a neutral
// gray) so the whole ring reads as "this item's color" at a glance, with a soft glow
// behind it. `periodElapsedPct` (optional) draws a "you are here" marker dot — only
// the dashboard card currently needs it.
export function ProgressRing({
  pct,
  periodElapsedPct,
  color,
  iconSize = 40,
  ringPadding = 8,
  glow = true,
  children,
}: {
  pct: number | null;
  periodElapsedPct?: number;
  color?: string | null;
  /** Diameter (px) of the icon this ring wraps. Defaults to the dashboard card's size-10 icon. */
  iconSize?: number;
  /** Extra radius (px) the ring extends beyond the icon on each side. */
  ringPadding?: number;
  /** Soft drop-shadow behind the ring, colored to match. Off for dense list rows. */
  glow?: boolean;
  children: React.ReactNode;
}) {
  const clamped = pct != null ? Math.min(100, Math.max(0, pct)) : 0;
  const over = (pct ?? 0) > 100;
  const ringColor = over ? "var(--danger)" : (color ?? "var(--success)");
  const trackColor = color ? `color-mix(in srgb, ${color} 35%, var(--background))` : "currentColor";
  const trackOpacity = color ? 1 : 0.12;

  const marker = periodElapsedPct != null;
  const markerAngle = ((periodElapsedPct ?? 0) / 100) * 2 * Math.PI;
  const markerX = 50 + 44 * Math.cos(markerAngle);
  const markerY = 50 + 44 * Math.sin(markerAngle);

  const ringSize = iconSize + ringPadding * 2;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: iconSize, height: iconSize, filter: glow && color ? `drop-shadow(0 0 20px ${color}66)` : undefined }}
    >
      {pct != null && (
        <svg
          viewBox="0 0 100 100"
          className="absolute -rotate-90 pointer-events-none"
          style={{ width: ringSize, height: ringSize, top: -ringPadding, left: -ringPadding }}
        >
          <circle cx="50" cy="50" r="44" fill="none" stroke={trackColor} strokeOpacity={trackOpacity} strokeWidth="7" />
          {clamped > 0 && (
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke={ringColor}
              strokeWidth="7"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${clamped} 100`}
              style={{ transition: "stroke-dasharray 500ms ease" }}
            />
          )}
          {marker && <circle cx={markerX} cy={markerY} r="4" fill="white" />}
        </svg>
      )}
      {children}
    </div>
  );
}

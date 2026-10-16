import { cn } from "@/lib/utils";

function pct(n: number) {
  return `${Math.max(0, Math.min(100, n * 100))}%`;
}

/**
 * The Clear progress bar. `value` (0–1) is the solid part — spent or saved — and
 * `reserved` (0–1) an optional hatched part right after it for money that is already
 * spoken for (bills still to come, projected savings). `marker` (0–1) draws a thin
 * line, e.g. "today" in the budget period. With `hatchRemainder` the whole empty
 * track is hatched instead ("still available").
 *
 * `fillClassName` overrides the fill colour (negative when over); `fillColor` takes a
 * raw colour instead, for category colours stored as hex.
 * The bar is decorative; put the numbers it shows in text next to it.
 */
export function ClearProgress({
  value,
  reserved = 0,
  marker,
  hatchRemainder = false,
  size = "md",
  onHero = false,
  className,
  fillClassName,
  fillColor,
  markerClassName,
}: {
  value: number;
  reserved?: number;
  marker?: number;
  hatchRemainder?: boolean;
  size?: "sm" | "md" | "lg";
  onHero?: boolean;
  className?: string;
  fillClassName?: string;
  fillColor?: string;
  markerClassName?: string;
}) {
  const height = size === "sm" ? "h-1.5" : size === "lg" ? "h-3.5" : "h-3";
  const track = hatchRemainder ? "clear-hatch" : onHero ? "bg-clear-hero-ink/12" : "bg-clear-ground";

  return (
    <div aria-hidden className={cn("relative flex overflow-hidden rounded-full", height, track, className)}>
      {/* With a reserved part the two meet flush; the track's own rounding caps the ends. */}
      <span className={cn("h-full bg-clear-ember", reserved > 0 ? "rounded-none" : "rounded-full", fillClassName)} style={{ width: pct(value), background: fillColor }} />
      {reserved > 0 && <span className={cn("h-full", onHero ? "clear-hatch-hero" : "clear-hatch")} style={{ width: pct(reserved) }} />}
      {marker != null && (
        <span
          className={cn("absolute -inset-y-0.5 w-0.5", onHero ? "bg-clear-hero-ink" : "bg-clear-ink", markerClassName)}
          style={{ left: pct(marker) }}
        />
      )}
    </div>
  );
}

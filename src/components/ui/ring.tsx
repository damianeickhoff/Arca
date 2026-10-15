import { cn } from "@/lib/utils";

/**
 * A progress ring: a surface-2 track with a round-capped arc in `color`, starting at
 * twelve o'clock. Whatever is passed as children sits in the middle (an icon, "60%").
 * Used by the Plan pages' debt and goal rows.
 */
export function Ring({
  pct,
  color,
  size = 44,
  stroke = 4,
  track = "var(--arca-surface-2)",
  children,
  className,
}: {
  pct: number;
  color: string;
  size?: number;
  stroke?: number;
  track?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {clamped > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${((c * clamped) / 100).toFixed(1)} ${c.toFixed(1)}`}
          />
        )}
      </svg>
      {children != null && <span className="relative inline-flex items-center justify-center">{children}</span>}
    </span>
  );
}

/** A thin progress bar on a surface-2 track — the Plan pages' category, debt and goal bars. */
export function Bar({ pct, color, height = 6, className }: { pct: number; color: string; height?: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <span className={cn("block w-full overflow-hidden rounded-full bg-surface-2", className)} style={{ height }}>
      <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${clamped}%`, background: color }} />
    </span>
  );
}

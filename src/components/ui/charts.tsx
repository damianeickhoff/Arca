import { cn } from "@/lib/utils";

// The V5 chart vocabulary for Insights: columns of rounded bars, a donut, an ink line
// over a mustard fill with a dashed second series, and a projection with a safety line.
// Plain SVG/HTML so they render on the server and follow the theme through the --arca
// tokens. Every chart takes its values as numbers and works out its own scale.

/** The categorical palette, in order, for series without a colour of their own. */
export const CHART_COLORS = [
  "var(--arca-ink)",
  "var(--arca-accent)",
  "var(--arca-positive)",
  "var(--arca-info)",
  "var(--arca-warning)",
  "#6B5BD2",
  "#1F8F8A",
  "#A9A294",
];

/**
 * Columns of stacked, rounded segments (bottom first) — "Week by week", "Six months".
 * HTML rather than SVG so the columns stretch with the card and keep round corners.
 * `title` gives each column a hover label.
 */
export function StackedBars({
  columns,
  colors,
  height = 150,
  gap = 8,
  titles,
  className,
}: {
  columns: number[][];
  colors: string[];
  height?: number;
  gap?: number;
  titles?: string[];
  className?: string;
}) {
  const max = Math.max(1, ...columns.map((c) => c.reduce((s, v) => s + Math.max(0, v), 0)));
  return (
    <div aria-hidden className={cn("flex items-end", className)} style={{ height, gap }}>
      {columns.map((col, i) => (
        <div key={i} title={titles?.[i]} className="flex h-full min-w-0 flex-1 flex-col-reverse gap-[2px]">
          {col.map((v, j) =>
            v > 0 ? (
              <span
                key={j}
                className="block w-full shrink-0 rounded-[4px]"
                style={{ height: `${(v / max) * 100}%`, minHeight: 3, background: colors[j % colors.length] }}
              />
            ) : null,
          )}
        </div>
      ))}
    </div>
  );
}

/** Side-by-side bars per bucket — two series compared (spending vs income). */
export function PairedBars({
  pairs,
  colors,
  height = 150,
  className,
}: {
  pairs: { label: string; a: number; b: number; title?: string }[];
  colors: [string, string];
  height?: number;
  className?: string;
}) {
  const max = Math.max(1, ...pairs.flatMap((p) => [p.a, p.b]));
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div aria-hidden className="flex items-end gap-3 sm:gap-5" style={{ height }}>
        {pairs.map((p, i) => (
          <div key={i} title={p.title} className="flex h-full min-w-0 flex-1 items-end justify-center gap-1">
            {[p.a, p.b].map((v, j) => (
              <span
                key={j}
                className="block w-full max-w-7 rounded-[4px]"
                style={{ height: `${(Math.max(0, v) / max) * 100}%`, minHeight: v > 0 ? 3 : 0, background: colors[j] }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-3 sm:gap-5">
        {pairs.map((p, i) => (
          <span key={i} className="mono-label min-w-0 flex-1 truncate text-center text-[10px]">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A ring split into coloured parts, with whatever is passed as children in the middle. */
export function Donut({
  parts,
  size = 170,
  children,
  className,
}: {
  parts: { value: number; color: string }[];
  size?: number;
  children?: React.ReactNode;
  className?: string;
}) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  const stroke = Math.round(size * 0.14);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--arca-surface-2)" strokeWidth={stroke} />
        {total > 0 &&
          parts.map((p, i) => {
            const len = (Math.max(0, p.value) / total) * c;
            // A 3px gap between parts, unless a part is the whole ring.
            const gap = parts.length > 1 ? Math.min(3, len / 2) : 0;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(0, len - gap).toFixed(1)} ${(c - len + gap).toFixed(1)}`}
                strokeDashoffset={(-offset).toFixed(1)}
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      {children != null && <span className="relative flex flex-col items-center text-center">{children}</span>}
    </span>
  );
}

/** A legend row: dot, label, value. */
export function LegendRow({ color, label, value, onClick }: { color: string; label: React.ReactNode; value: React.ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <span className="inline-flex min-w-0 items-center gap-2 text-[13px] text-ink-2">
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">{value}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="-mx-2 flex items-center justify-between gap-2.5 rounded-row px-2 py-1 text-left transition-colors hover:bg-surface-2">
      {inner}
    </button>
  ) : (
    <div className="flex items-center justify-between gap-2.5 py-1">{inner}</div>
  );
}

type Pt = readonly [number, number];
const path = (pts: readonly Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

/**
 * Two series on one scale: `a` as an ink line over a mustard fill, `b` as a dashed line
 * over a light fill in `bColor` — net worth's assets against debts.
 */
export function LayeredArea({
  a,
  b,
  bColor = "var(--arca-negative)",
  height = 200,
  gradientId,
  className,
}: {
  a: number[];
  b?: number[];
  bColor?: string;
  height?: number;
  gradientId: string;
  className?: string;
}) {
  if (a.length < 2) return null;
  const w = 660;
  const h = 200;
  const pad = 4;
  const all = [...a, ...(b ?? [])];
  const min = Math.min(0, ...all);
  const max = Math.max(1, ...all);
  const P = (arr: number[]) => arr.map((v, i) => [pad + (i / (arr.length - 1)) * (w - pad * 2), h - pad - ((v - min) / (max - min)) * (h - pad * 2)] as const);
  const A = P(a);
  const B = b && b.length > 1 ? P(b) : null;
  const area = (xy: readonly Pt[]) => `${path(xy)} L${xy[xy.length - 1][0].toFixed(1)} ${h} L${xy[0][0].toFixed(1)} ${h} Z`;
  const last = A[A.length - 1];
  return (
    <div className={cn("relative w-full", className)} style={{ height }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--arca-accent)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--arca-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={0} x2={w} y1={h - pad - g * (h - pad * 2)} y2={h - pad - g * (h - pad * 2)} stroke="var(--arca-line)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area(A)} fill={`url(#${gradientId})`} />
        <path d={path(A)} fill="none" stroke="var(--arca-ink)" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {B && (
          <>
            <path d={area(B)} fill={bColor} fillOpacity={0.1} />
            <path d={path(B)} fill="none" stroke={bColor} strokeWidth={2} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {/* The end dot sits outside the stretched SVG so it stays round. */}
      <span
        aria-hidden
        className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink"
        style={{ left: `${(last[0] / w) * 100}%`, top: `${(last[1] / h) * 100}%` }}
      />
    </div>
  );
}

/** Evenly spaced axis labels under a chart (first, last and a few in between). */
export function AxisLabels({ labels, className }: { labels: string[]; className?: string }) {
  return (
    <div className={cn("flex justify-between gap-2", className)}>
      {labels.map((l, i) => (
        <span key={i} className="mono-label truncate text-[10px]">
          {l}
        </span>
      ))}
    </div>
  );
}

/** Pick `count` labels spread evenly over a list (always the first and the last). */
export function spreadLabels<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, i) => items[Math.round((i / (count - 1)) * (items.length - 1))]);
}

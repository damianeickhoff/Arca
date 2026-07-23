import { cn } from "@/lib/utils";

export interface Bucket { label: string; value: number; barColor?: string }

// Analytics tab's hand-rolled compact bar chart (see StyleDescriptions/analytics-page-style.md
// §6a) — no axis, no library, just slim centered bars. Reused wherever a page wants that same
// glanceable, in-card look instead of a full Recharts axis/tooltip setup.
export function MiniBarChart({ buckets, color, className }: { buckets: Bucket[]; color: (v: number) => string; className?: string }) {
  const max = Math.max(...buckets.map((b) => Math.abs(b.value)), 1);
  return (
    // No `items-end` on this row — that would size each column to its own content
    // instead of stretching it to the row's h-24, which leaves the bar's percentage
    // height with no defined parent height to resolve against (so it silently
    // collapses to nothing). Default `items-stretch` gives every column the full
    // height so the bar's own height percentage actually has something to size against.
    <div className={cn("flex justify-between gap-1 h-24 px-1", className)}>
      {buckets.map((b, i) => (
        <div key={`${b.label}-${i}`} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
          {/* Bar itself stays a slim fixed width (narrower than its own date label)
              rather than filling the whole column — a full-width bar per column reads
              as one solid block instead of a legible bar chart. */}
          <div className="w-full flex-1 flex items-end justify-center">
            <div
              className="w-2 rounded-full transition-all"
              style={{ height: `${Math.max(4, (Math.abs(b.value) / max) * 100)}%`, backgroundColor: b.barColor ?? color(b.value) }}
            />
          </div>
          <span className="text-[9px] text-foreground/40 tabular-nums">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

// Cashflow's own chart — each bucket shows a neutral bar next to a green bar instead of one
// net value, so the two series are directly comparable period by period. Works for any bucket
// count (5 period-buckets in Analytics, 12 months in Trends).
export function PairedBarChart({ a, b, aColor = "color-mix(in srgb, var(--foreground) 55%, transparent)", bColor = "var(--color-income)", className }: {
  a: Bucket[];
  b: Bucket[];
  aColor?: string;
  bColor?: string;
  className?: string;
}) {
  const max = Math.max(...a.map((x) => Math.abs(x.value)), ...b.map((x) => Math.abs(x.value)), 1);
  return (
    <div className={cn("flex justify-between gap-1.5 h-32 px-1", className)}>
      {a.map((x, i) => {
        const y = b[i];
        return (
          <div key={`${x.label}-${i}`} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <div className="w-full flex-1 flex items-end justify-center gap-1">
              <div
                className="w-1.5 rounded-full transition-all"
                style={{ height: `${Math.max(4, (Math.abs(x.value) / max) * 100)}%`, backgroundColor: aColor }}
              />
              <div
                className="w-1.5 rounded-full transition-all"
                style={{ height: `${Math.max(4, (Math.abs(y?.value ?? 0) / max) * 100)}%`, backgroundColor: bColor }}
              />
            </div>
            <span className="text-[9px] text-foreground/40 tabular-nums">{x.label}</span>
          </div>
        );
      })}
    </div>
  );
}

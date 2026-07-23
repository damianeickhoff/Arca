import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Analytics tab's "photo card" stat tile (StyleDescriptions/analytics-page-style.md §2b) —
// a fixed near-black square regardless of theme, used for single-glance facts. Deliberately
// theme-static, not a `bg-card` variant.
export function StatTile({
  label,
  value,
  valueClassName = "text-xl font-bold tabular-nums",
  badge,
  footer,
  className,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  badge?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative rounded-2xl bg-[#0f0f0f] p-4 flex flex-col aspect-square", className)}>
      <p className="text-xs text-white/50 mb-1">{label}</p>
      <p className={cn(valueClassName, "text-white")}>{value}</p>
      {footer && <div className="text-xs text-white/50 mt-2">{footer}</div>}
      {badge}
    </div>
  );
}

// The circular icon badge anchored bottom-left on a StatTile (e.g. Analytics' red "%" chip).
export function TileBadge({ icon: IconComp, color }: { icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <div className="absolute bottom-3 left-3 size-11 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: color }}>
      <IconComp className="size-7 text-white" />
    </div>
  );
}

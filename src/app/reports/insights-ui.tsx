import { cn } from "@/lib/utils";
import { ChangePill } from "@/components/change-pill";

// Shared pieces of the V5 Insights tabs.

export const CARD = "rounded-card border border-line bg-surface shadow-card";

/** A KPI card: mono label, the figure, and the change against the previous period. */
export function Kpi({
  label,
  value,
  change,
  tone = "default",
  note,
}: {
  label: string;
  value: React.ReactNode;
  change: { label: string; up: boolean } | null;
  tone?: "default" | "positive" | "accent";
  /** Shown in place of the change when there is nothing to compare against. */
  note?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-banner border border-line bg-surface px-4 py-3.5 shadow-card lg:px-[18px] lg:py-4">
      <span className="mono-label truncate text-[10px]">{label}</span>
      <span
        className={cn(
          "amount truncate text-lg leading-tight tabular-nums lg:text-[22px]",
          tone === "positive" ? "text-positive" : tone === "accent" ? "text-mustard-strong" : "text-ink",
        )}
      >
        {value}
      </span>
      <ChangePill change={change} />
      {!change && note && <span className="truncate text-[11px] text-ink-3">{note}</span>}
    </div>
  );
}

/** A small fact tile on surface-2 (favourite category, transactions, popular day). */
export function FactTile({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 rounded-tile border border-line bg-surface px-3.5 py-3 shadow-card", className)}>
      <span className="mono-label truncate text-[10px]">{label}</span>
      {children}
    </div>
  );
}

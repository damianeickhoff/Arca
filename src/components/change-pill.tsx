import { IconArrowDownRight as ArrowDownRight, IconArrowUpRight as ArrowUpRight } from "@tabler/icons-react";

export type Change = { label: string; up: boolean } | null;

// Analytics' period-over-period pill (see StyleDescriptions/analytics-page-style.md §5),
// lifted out of analytics-tab.tsx so Trends and Net worth can reuse the exact same visual
// language instead of re-implementing it. Direction is semantic, not literal — callers
// pre-flip the sign so "up" always means "good" (e.g. spending less is the good direction).
export function ChangePill({ change }: { change: Change }) {
  if (!change) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-semibold rounded-full px-2 py-1"
      style={change.up
        ? { background: "color-mix(in srgb, var(--color-income) 15%, transparent)", color: "var(--color-income)" }
        : { background: "color-mix(in srgb, var(--color-expense) 15%, transparent)", color: "var(--color-expense)" }}
    >
      {change.up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {change.label}
    </span>
  );
}

// ChangePill + caption, stacked underneath an amount. Renders nothing when there's no
// previous-period data to compare against.
export function ChangeRow({ change, caption = "vs last period", className = "mt-1" }: { change: Change; caption?: string; className?: string }) {
  if (!change) return null;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <ChangePill change={change} />
      <span className="text-sm text-foreground/40">{caption}</span>
    </div>
  );
}

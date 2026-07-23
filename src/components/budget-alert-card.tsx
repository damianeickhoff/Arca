"use client";

import { useBudgetPortal } from "@/lib/budget-portal-state";

// Circular budget-usage ring for the overall-budget alert card — a full ring rather
// than the semicircular Gauge on the Budget portal (components/budget-portal.tsx),
// since this sits inline in a compact row instead of its own card.
function BudgetRing({
  pct,
  severity,
}: {
  pct: number;
  severity: "success" | "warning" | "danger";
}) {
  const clamped = Math.min(100, Math.max(0, pct));

  const color =
    severity === "danger"
      ? "var(--color-danger)"
      : severity === "warning"
        ? "#f59e0b"
        : "var(--success)";

  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 100 100" className="size-16 -rotate-90">
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="9"
        />
        {clamped > 0 && (
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${clamped} 100`}
          />
        )}
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold tabular-nums" style={{ color }}>
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  );
}

// Tapping this opens the same Budget portal as the header's wallet icon (see
// BudgetPortalProvider) instead of navigating to the old standalone /budget page.
export function BudgetAlertCard({
  pct,
  severity,
  title,
  description,
}: {
  pct: number;
  severity: "success" | "warning" | "danger";
  title: string;
  description: string;
}) {
  const { openBudget } = useBudgetPortal();
  return (
    <button
      type="button"
      onClick={openBudget}
      className="flex items-center gap-4 mx-3 mt-5 rounded-2xl bg-card p-4 active:scale-[0.98] transition-transform duration-150 w-[calc(100%-1.5rem)] text-left"
    >
      <BudgetRing pct={pct} severity={severity} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-base text-foreground">{title}</p>
        <p className="text-sm text-foreground/50 mt-1">{description}</p>
      </div>
    </button>
  );
}

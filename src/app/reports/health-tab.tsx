import {
  IconShieldCheckFilled,
  IconCircleCheckFilled,
  IconAlertCircleFilled,
  IconAlertTriangleFilled,
  IconArrowUpRight,
} from "@tabler/icons-react";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { getFinancialHealth } from "@/lib/financial-health-data";
import { getHealthHistory } from "@/lib/health-snapshots";
import { healthState, type HealthStateKey } from "@/lib/financial-health";
import { formatEur } from "@/lib/format";
import { ProgressRing } from "@/components/progress-ring";
import { HealthTrendChart } from "./health-trend-chart";

// ─── Insights → Health ───────────────────────────────────────────────────────
//
// A high-level read on where the user's finances stand: one score, why it is what
// it is, and what would move it most. Deliberately not a budgeting, forecasting or
// analytics view — there's no period picker and no per-transaction detail; the
// other Insights tabs own that. All scoring lives in lib/financial-health.ts and
// lib/financial-health-data.ts; this file only renders.

const STATE_ICONS: Record<HealthStateKey, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  excellent: IconShieldCheckFilled,
  good: IconCircleCheckFilled,
  fair: IconAlertCircleFilled,
  attention: IconAlertTriangleFilled,
};

/** Per-category bar colour, taken from the same 0–100 bands as the overall state so
 * a "good" category and a "good" overall score always read as the same colour. */
function ratioColor(ratio: number) {
  return healthState(ratio * 100).color;
}

const SHELL = "bg-[var(--dialog-content-background)] rounded-2xl p-4";

/** Segmented 10-block bar — the "instantly spot the weak area" view in §Category
 * contribution. Rendered as elements rather than block characters so it inherits
 * the theme and stays crisp at any width. */
function BlockBar({ ratio, color }: { ratio: number; color: string }) {
  const filled = Math.round(ratio * 10);
  return (
    <div className="flex gap-0.5" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className="h-2 flex-1 rounded-[2px]"
          style={{ backgroundColor: i < filled ? color : "color-mix(in srgb, currentColor 12%, transparent)" }}
        />
      ))}
    </div>
  );
}

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

export async function HealthTab() {
  const financialMonth = await getFinancialMonthConfig();
  const [health, history] = await Promise.all([getFinancialHealth(financialMonth), getHealthHistory(12)]);

  const wrapper = "px-4 pb-[calc(8rem+var(--sab))] pt-4 space-y-4";

  // Nothing measurable at all — every category came back as "not enough data".
  if (health.score === null || health.state === null) {
    return (
      <div className={wrapper}>
        <div className={`${SHELL} text-center py-10`}>
          <p className="text-lg font-semibold text-foreground">Financial Health</p>
          <p className="mt-2 text-sm text-foreground/50 max-w-xs mx-auto leading-relaxed">{health.summary}</p>
        </div>
      </div>
    );
  }

  const StateIcon = STATE_ICONS[health.state.key];
  const trend = history.filter((h) => h.score != null).map((h) => ({ month: h.month, score: h.score }));

  return (
    <div className={wrapper}>

      {/* ── 1. Overall health — score ring, state, and the generated summary ── */}
      <div className="bg-[var(--dialog-content-background)] p-1 rounded-2xl">
        <div className="rounded-b-sm rounded-t-2xl bg-[var(--dialog-background)]/60 dark:bg-[var(--dialog-background)]/30 px-4 pt-5 pb-6 flex flex-col items-center">
          <p className="text-md text-foreground/60 mb-4">Financial Health</p>

          <ProgressRing pct={health.score} color={health.state.color} iconSize={124} ringPadding={10}>
            <div className="flex flex-col items-center justify-center">
              <p className="text-4xl font-semibold tabular-nums tracking-tight text-foreground leading-none">
                {health.score}
              </p>
              <p className="text-xs text-foreground/40 tabular-nums mt-1">/ 100</p>
            </div>
          </ProgressRing>

          <div className="flex items-center gap-1.5 mt-5">
            <StateIcon className="size-4" style={{ color: health.state.color }} />
            <p className="text-base font-semibold" style={{ color: health.state.color }}>
              {health.state.label}
            </p>
          </div>
        </div>

        <p className="px-4 py-4 text-sm text-foreground/60 leading-relaxed">{health.summary}</p>
      </div>

      {/* ── 2. Breakdown — every category with its own score, bar and explanation.
             Unmeasurable categories stay listed (greyed, "Not enough data") rather
             than disappearing, so the page always shows the full picture of what
             the score is and isn't made of. ── */}
      <div>
        <h2 className="text-sm font-semibold text-foreground/60 mb-2 px-1">Health breakdown</h2>
        <div className="space-y-2">
          {health.categories.map((cat) => {
            const color = cat.ratio === null ? "transparent" : ratioColor(cat.ratio);
            return (
              <div key={cat.key} className={SHELL}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{cat.label}</p>
                  {cat.points === null ? (
                    <p className="text-xs text-foreground/40 shrink-0">Not enough data</p>
                  ) : (
                    <p className="text-sm font-semibold tabular-nums shrink-0" style={{ color }}>
                      {cat.points} <span className="text-foreground/40 font-normal">/ {cat.maxPoints}</span>
                    </p>
                  )}
                </div>

                <div className="mt-2.5 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                  {cat.ratio !== null && (
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{ width: `${Math.round(cat.ratio * 100)}%`, backgroundColor: color }}
                    />
                  )}
                </div>

                <p className="mt-2.5 text-xs text-foreground/50 leading-relaxed">{cat.detail}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 3. Improvement opportunities — the weakest measured categories, ranked
             by how many points of the final score each is leaving on the table. ── */}
      {health.opportunities.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground/60 mb-2 px-1">Improvement opportunities</h2>
          <div className="space-y-2">
            {health.opportunities.map((op) => (
              <div key={op.key} className={`${SHELL} flex items-center justify-between gap-3`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{op.action}</p>
                  <p className="text-xs text-foreground/40 mt-0.5">Potential improvement</p>
                </div>
                <span
                  className="flex items-center gap-1 shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums"
                  style={{
                    color: "var(--color-success)",
                    backgroundColor: "color-mix(in srgb, var(--color-success) 14%, transparent)",
                  }}
                >
                  <IconArrowUpRight className="size-3.5" />
                  {op.potential} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4. Health trend — one snapshot per financial month (see
             lib/health-snapshots.ts). Two points are the minimum for a line to
             mean anything, so a single month shows the explanation instead. ── */}
      <div>
        <h2 className="text-sm font-semibold text-foreground/60 mb-2 px-1">Health trend</h2>
        <div className={SHELL}>
          {trend.length >= 2 ? (
            <HealthTrendChart data={trend} />
          ) : (
            <p className="text-xs text-foreground/50 leading-relaxed py-6 text-center">
              Your score is recorded once a month. The trend appears here from your second recorded month.
            </p>
          )}
        </div>
      </div>

      {/* Monthly history — the recorded snapshots as a plain table, newest first.
          No period picker by design: this is a look back, not a filter. */}
      {history.length > 0 && (
        <div className={SHELL}>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-2 text-xs">
            <p className="text-foreground/40 font-medium">Month</p>
            <p className="text-foreground/40 font-medium text-right">Health</p>
            <p className="text-foreground/40 font-medium text-right">Net worth</p>
            <p className="text-foreground/40 font-medium text-right">Savings</p>

            {[...history].reverse().map((row) => (
              <div key={row.month} className="contents">
                <p className="text-foreground/70">{monthLabel(row.month)}</p>
                <p className="text-right font-semibold tabular-nums" style={{ color: healthState(row.score).color }}>
                  {Math.round(row.score)}
                </p>
                <p className="text-right tabular-nums text-foreground/70">
                  {row.netWorth == null ? "—" : formatEur(row.netWorth)}
                </p>
                <p className="text-right tabular-nums text-foreground/70">
                  {row.savingsRate == null ? "—" : `${Math.round(row.savingsRate * 100)}%`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 5. Category contribution — the whole breakdown as one scannable block,
             so a weak area is obvious without reading any of the explanations. ── */}
      <div>
        <h2 className="text-sm font-semibold text-foreground/60 mb-2 px-1">Category contribution</h2>
        <div className={`${SHELL} space-y-3`}>
          {health.categories.map((cat) => (
            <div key={cat.key}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <p className="text-xs text-foreground/70">{cat.label}</p>
                <p className="text-xs tabular-nums text-foreground/50 shrink-0">
                  {cat.points === null ? "n/a" : `${cat.points}/${cat.maxPoints}`}
                </p>
              </div>
              <BlockBar ratio={cat.ratio ?? 0} color={cat.ratio === null ? "transparent" : ratioColor(cat.ratio)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

export type BudgetStrategy = { nodig: number; willen: number; sparen: number };

const LABELS: Record<keyof BudgetStrategy, string> = {
  nodig: "Needs",
  willen: "Wants",
  sparen: "Savings & Debts",
};
const COLORS: Record<keyof BudgetStrategy, string> = {
  nodig: "#ffffff",
  willen: "#ffffff",
  sparen: "#ffffff",
};
const KEYS = ["nodig", "willen", "sparen"] as const;

// The three-way Needs/Wants/Savings split sliders — shared by the profile settings
// "Budget strategy" card and the onboarding wizard's strategy step.
export function BudgetStrategySliders({
  value,
  onChange,
  dark,
}: {
  value: BudgetStrategy;
  onChange: (v: BudgetStrategy) => void;
  /** Swaps the theme-token colors (text-foreground, bg-foreground/5, ...) for hardcoded
   *  white-on-dark ones — for the onboarding wizard, which renders this on a forced-dark
   *  auth-gradient background where theme tokens go invisible in light mode. */
  dark?: boolean;
}) {
  const total = value.nodig + value.willen + value.sparen;
  const c = dark
    ? { label: "text-white/70", inputBg: "bg-white/10", inputText: "text-white", pct: "text-white/70", track: "bg-white/10" }
    : { label: "text-foreground", inputBg: "bg-foreground/5", inputText: "text-foreground", pct: "text-foreground", track: "bg-foreground/10" };

  function set(key: keyof BudgetStrategy, next: number) {
    const max = 100 - (total - value[key]);
    onChange({ ...value, [key]: Math.max(0, Math.min(max, next)) });
  }

  return (
    <div className="space-y-5">
      {KEYS.map((key) => {
        const max = 100 - (total - value[key]);
        const pct = max > 0 ? (value[key] / max) * 100 : 0;
        // The thumb (16px, 8px radius) is positioned with `left: pct%` — computed
        // against the full track width, which would let it bleed half its width past
        // the track at 0%/100% (percentage offsets on an absolutely positioned element
        // ignore the containing block's padding). `calc()` reserves 8px on each side
        // so the thumb's center never goes past the track's true edges, keeping it
        // fully visible instead of getting clipped by an ancestor's overflow-hidden.
        const thumbLeft = `calc(8px + (100% - 16px) * ${pct / 100})`;
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between">
              <label className={`text-sm font-normal px-1 ${c.label}`}>{LABELS[key]}</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={max}
                  value={value[key]}
                  onChange={(e) => set(key, parseInt(e.target.value) || 0)}
                  className={`w-17 text-center rounded-xl py-1 pl-4 text-sm ${c.inputBg} ${c.inputText}`}
                />
                <span className={`text-sm ${c.pct}`}>%</span>
              </div>
            </div>
            <div className="relative h-4 flex items-center">
              <div className={`absolute inset-x-2 h-1.5 rounded-full ${c.track}`} />
              <div
                className="absolute h-1.5 rounded-full"
                style={{ left: 3, width: `calc((100% - 16px) * ${pct / 100})`, backgroundColor: COLORS[key] }}
              />
              <div
                className="absolute top-1/2 size-4 rounded-full -translate-y-1/2 -translate-x-1/2 shadow-sm"
                style={{ left: thumbLeft, backgroundColor: COLORS[key] }}
              />
              <input
                type="range"
                min={0}
                max={max}
                value={value[key]}
                onChange={(e) => set(key, parseInt(e.target.value))}
                className="absolute inset-0 z-10 w-full h-full opacity-0 cursor-pointer m-0 touch-none"
              />
            </div>
          </div>
        );
      })}
      <div className={`text-xs text-center font-medium ${total === 100 ? "text-success" : "text-danger"}`}>
        {total !== 100 ? "Total must be 100%" : ""}
      </div>
    </div>
  );
}

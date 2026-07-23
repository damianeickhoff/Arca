# Analytics Page — Style Description

Source of truth: [`src/app/reports/analytics-tab.tsx`](../src/app/reports/analytics-tab.tsx) (the "Rapporten" tab
content, rendered both at `/reports?tab=rapporten` and inside the mobile Reports portal). This document captures
every visual convention used there so it can be reapplied consistently to other pages.

This is the app's most mobile-tuned, "financial app" surface — closer to a banking app's home screen than to a
generic admin dashboard. It favors dense, glanceable stat tiles over long axis-labeled charts, and reserves full
Recharts graphs for the one or two places that actually need a real trend line.

---

## 1. Page shell & rhythm

- Root container: `px-4 pt-1 pb-[calc(8rem+var(--sab))] lg:pb-4 space-y-4`
  - `space-y-4` is the section rhythm — every major block (Cashflow, Spending, Income, Budget, stat-tile rows,
    Calendar) is a sibling separated by the same 1rem gap. No section uses its own custom margin-top/bottom.
  - The oversized bottom padding (`8rem` + safe-area-bottom) on mobile clears the floating bottom nav / FAB; on
    `lg:` it collapses to a normal `p-4`.
- No page-level heading inside the tab itself — the page chrome (title, period label, tab switcher) lives one
  level up in `page.tsx` / `reports-portal-content.tsx`. The tab content starts directly with data.

## 2. The two card shells

Two distinct "card" patterns are used, chosen by whether the block is a hero metric or a plain data block.

### 2a. Nested two-tone shell (hero metric blocks: Cashflow / Spending / Income)

```tsx
<div className="bg-white/5 p-1 rounded-2xl">
  <div className="rounded-b-sm rounded-t-2xl bg-white/2 py-2 px-4 pb-3">
    {/* label, big number, change pill, chart */}
  </div>
  {/* optional secondary rows sitting outside the inner shell but inside the outer one */}
</div>
```

- Outer wrapper: `bg-white/5 p-1 rounded-2xl` — a barely-there tint that reads as a hairline frame, with only
  `p-1` (4px) of breathing room before the inner block.
- Inner block: `bg-white/2` (even fainter) with `rounded-t-2xl` on top but `rounded-b-sm` on the bottom — the
  corner radius deliberately mismatches so the block reads as "torn off" from a slightly larger outer card. Content
  padding is `py-2 px-4 pb-3` (asymmetric — less on top, more on the bottom for the chart).
- This shell is theme-static (`bg-white/5` / `bg-white/2`, not `dark:`-prefixed) — it's a fixed low-alpha white
  wash meant to read as a subtle highlight against the page background in both themes, not a "light card on dark
  page" pattern.

### 2b. Flat single-tone cards (everything else: Budget ring, square stat tiles, Calendar)

```tsx
<div className="rounded-2xl bg-card p-5">…</div>            // Budget, Calendar
<div className="relative rounded-2xl bg-[#0f0f0f] p-4 flex flex-col aspect-square">…</div>  // stat tiles
```

- Regular content cards: `rounded-2xl bg-card p-5` — the standard theme-aware card token used everywhere else in
  the app.
- The four small stat tiles (Largest expense, Favorite category, Transactions, Popular day) are the one exception:
  they hard-code `bg-[#0f0f0f]` (near-black) regardless of light/dark theme, laid out `aspect-square` in a
  `grid grid-cols-2 gap-3`. This is a deliberate "photo card" look for glanceable single-fact tiles — treat it as
  a distinct, intentional sub-style, not something to theme-ify.

## 3. Typography scale

| Role | Classes |
|---|---|
| Section label (small caption above a big number) | `text-md text-foreground/60 mb-1` |
| Big hero number | `text-2xl font-semibold tabular-nums tracking-tight` |
| Stat-tile label | `text-xs text-foreground/50 mb-1` |
| Stat-tile value | `text-xl font-bold tabular-nums` / `text-2xl font-bold tabular-nums` |
| Card heading (Budget, Calendar) | `font-semibold text-sm` |
| Secondary/meta caption | `text-sm text-foreground/40` or `text-xs text-foreground/50` |
| Tiny axis/day labels | `text-[9px]`–`text-[11px] text-foreground/35`–`text-foreground/40` |

Rules of thumb: every euro amount and count gets `tabular-nums`; captions step down in opacity as they step down in
importance (`/60` → `/50` → `/40` → `/35`); no italics, no letter-spacing except the rare uppercase micro-label.

## 4. Color system

Semantic CSS variables from `globals.css` — never hard-coded hex for financial polarity:

- `--color-income` (aliases `--success`, a green) — anything "more is good" (income amounts, positive change).
- `--color-expense` (a rose/red, distinct per theme) — anything "more is bad" (expense amounts, negative change).
- `--danger` — over-budget states (e.g. the budget ring flips to this at ≥100%, the `PercentBadge` chip uses it).
- `--foreground` at various opacities for neutral bars/dots (spending bars, popular-day bars) — neutral data never
  gets its own hue, it's always `color-mix(in srgb, var(--foreground) N%, transparent)`.

Tinted pill backgrounds are built live with `color-mix`, never a separate `--*-bg` variable:

```tsx
style={{ background: "color-mix(in srgb, var(--color-income) 15%, transparent)", color: "var(--color-income)" }}
```

This single pattern (15% mix for the background, full opacity for the text/icon) is reused for every
income/expense-tinted chip, badge, and icon well on the page.

## 5. The "change pill" pattern

Every hero metric that has a previous-period comparison shows the same two-part unit:

```tsx
<ChangePill change={...} />          // pill: arrow icon + "±N.N%" or "New", tinted per direction
<span className="text-sm text-foreground/40">vs last period</span>
```

- Pill: `inline-flex items-center gap-0.5 text-[10px] font-semibold rounded-full px-2 py-1`, background/text tinted
  via the color-mix pattern above. Direction is **semantic, not literal** — callers pre-flip the sign so "up" always
  means "good" going into the pill (e.g. Spending's change is inverted before being passed in, since spending less
  is the good direction).
- Icon: `IconArrowUpRight` / `IconArrowDownRight` at `size-3.5`, matching the pill's tint.
- Renders nothing (not even the wrapper) when there's no prior-period data — no "N/A" placeholder, the row is
  simply absent.
- `"New"` label when the previous period was exactly zero and the current period isn't.

## 6. Charts — two different techniques for two different jobs

### 6a. Hand-rolled mini bar charts (compact, in-card, no axis)

Used for the Cashflow/Spending/Income period buckets — 5 or fewer bars, no library, pure divs:

```tsx
<div className="flex justify-between gap-3 h-24 px-1">
  <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
    <div className="w-full flex-1 flex items-end justify-center">
      <div className="w-2 rounded-full transition-all" style={{ height: `${pct}%`, backgroundColor: color }} />
    </div>
    <span className="text-[10px] text-foreground/40 tabular-nums">{label}</span>
  </div>
</div>
```

Key details worth preserving if copying this pattern:
- The bar column uses `items-stretch` (the default — never `items-end` on the row), because a bar's height
  percentage needs a parent with a resolved height to size against; `items-end` collapses that.
- Bars are a fixed slim `w-2`, centered in their flex column — never full-column-width — so multiple bars read as
  a bar *chart*, not a solid block.
- Minimum bar height is clamped (`Math.max(4, …)`) so a near-zero value still renders a sliver, never disappears.
- The Cashflow variant (`CashflowBarChart`) pairs a neutral spend bar with a green income bar side-by-side per
  bucket instead of one net bar, so the two are visually comparable per period.

### 6b. Full Recharts line/bar charts (axis, tooltip, legend)

Used elsewhere in Reports (Trends' Income vs Expenses line, Net worth trend, Savings rate, Fixed costs stacked
bar). Shared conventions across all of them (see `src/components/dashboard-charts.tsx`):
- `<CartesianGrid vertical={false} strokeDasharray="4 4" stroke="currentColor" strokeOpacity={0} />` — grid lines
  defined but opacity-zeroed (kept for potential future toggle, currently invisible).
- Axes: `axisLine={false} tickLine={false}`, tick `{ fontSize: 11, fill: "currentColor", opacity: 0.5 }`.
- Y-axis currency ticks compact to `€Nk` via `tickFormatter={(v) => \`€${(v/1000).toFixed(0)}k\`}`.
- Custom tooltip (`ChartTooltip` in `dashboard-charts.tsx`): `rounded-xl bg-card-glass px-3.5 py-2.5 text-xs`,
  uppercase tiny label, one row per series with a color dot + name + right-aligned bold `tabular-nums` value.
- Line charts use a horizontal gradient stroke (`gradientUnits="userSpaceOnUse"`, transparent → solid) rather than
  a flat color, with an `EndDot` marker only on the final data point (`circle` with a white stroke).
- Income uses `var(--color-income)`, expense `var(--color-expense)`; anything without inherent polarity uses the
  `--chart-1`…`--chart-5` palette positionally.

## 7. Icon chips

Two sizes of circular icon wells recur throughout:
- Small: `size-8 rounded-lg` (not fully round) with a `color-mix(…15%…)` tinted background, used as a leading
  glyph on KPI cards (e.g. Trends' Avg. income/expense tiles).
- Large: `size-11 rounded-full`, solid (not tinted) background, e.g. `PercentBadge`'s red circle or the category
  `Icon` component at `size="xl" round` — used as an absolutely-positioned badge anchored `bottom-3 left-3` on a
  stat tile.

Tabler icons (`@tabler/icons-react`, "Filled" variants preferred for solid glyphs) are globally thinned to
`stroke-width: 1.5` for the outlined ones via the `.tabler-icon` rule in `globals.css`.

## 8. Budget ring

A hand-drawn SVG progress ring (`BudgetRing` in `analytics-tab.tsx`): two overlaid `<circle>`s (track at 10%
opacity, progress stroke), `strokeLinecap="round"`, rotated `-rotate-90` so progress starts at 12 o'clock,
animated via `transition: stroke-dashoffset 500ms ease`. Progress color is `var(--color-income)` normally, flips to
`var(--danger)` at/above 100%. Percentage is centered inside via absolute positioning, `text-lg font-bold
tabular-nums`.

## 9. Calendar grid

`grid grid-cols-7 gap-1.5`, weekday initials as a header row, leading blank cells to align the 1st to its real
weekday (Monday-first week, `mondayIndex()` helper rotates JS's Sunday-first `getDay()`). Each day cell is
`aspect-square rounded-lg`, background tinted by activity (`color-mix(foreground 6%)` active vs `2%` empty), with a
`ring-1 ring-foreground/50` on today. Net amount inside uses `formatCompactEur` (`€5K`-style) so it never wraps at
this cell size.

## 10. Formatting helpers

- `formatEur` — full euro formatting, used everywhere space allows.
- `formatCompactEur` — `Intl.NumberFormat(..., { notation: "compact" })` → `"€5K"`, reserved for the few tight
  spots (stat tiles, calendar cells) where the full string would wrap.
- `pctChangeLabel(current, previous)` — returns `{ label: "+N.N%" | "-N.N%" | "New", up: boolean }` or `null` when
  there's nothing to compare against (never renders a fake "0%").

## 11. What this style deliberately avoids

- No glassmorphism (`.glass-surface` / `.bg-card-glass` / backdrop-blur) inside the Analytics tab itself — that
  treatment is reserved for floating chrome (search, popovers, the mobile sticky header) elsewhere in the app.
  Analytics achieves depth with flat opacity layering (`bg-white/5` → `bg-white/2` → `bg-[#0f0f0f]`) instead.
- No axis-labeled charts for the compact period buckets — those stay hand-rolled divs. Recharts is reserved for
  genuinely multi-month trend lines where an axis/tooltip earns its keep.
- No empty-state numbers — a missing previous period, a category with no spend, etc. either renders nothing or an
  explicit short sentence ("No spending yet this period."), never a `€0` that could be mistaken for real data.

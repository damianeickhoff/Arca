import { IconTarget } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { goalIconBackground } from "./goal-shared";
import { MoneyText } from "@/components/clear/money";

const ICON_SIZE = {
  md: { icon: "md", box: "size-10", glyph: 20 },
  xl: { icon: "xl", box: "size-12", glyph: 24 },
  xxl: { icon: "xxl", box: "size-14", glyph: 28 },
} as const;

/** A goal's icon on its own pastel; a target glyph in the goal's colour when it has no icon. */
export function GoalIcon({ icon, color, size = "md" }: { icon: string | null; color: string | null; size?: keyof typeof ICON_SIZE }) {
  const s = ICON_SIZE[size];
  if (icon) return <Icon iconKey={icon} color={color} background={goalIconBackground(color)} size={s.icon} />;
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-clear-icon text-clear-info", s.box)}
      style={{ background: goalIconBackground(color), color: color ?? undefined }}
    >
      <IconTarget size={s.glyph} stroke={1.9} />
    </span>
  );
}

/** A 96px progress ring with the percentage in the middle. */
export function ProgressRing({ pct, color, label }: { pct: number; color: string; label: string }) {
  const r = 40;
  const length = 2 * Math.PI * r;
  const done = (Math.max(0, Math.min(100, pct)) / 100) * length;
  return (
    <span role="img" aria-label={label} className="relative inline-flex size-24 shrink-0">
      <svg viewBox="0 0 100 100" className="size-24" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="11" className="stroke-clear-ground" />
        {done > 0 && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={`${done.toFixed(1)} ${length.toFixed(1)}`}
            transform="rotate(-90 50 50)"
          />
        )}
      </svg>
      <span aria-hidden className="absolute inset-0 flex items-center justify-center text-xl font-extrabold tracking-[-0.02em] tabular-nums">
        {Math.round(pct)}%
      </span>
    </span>
  );
}

/**
 * Saved so far (a solid line over a wash of the goal's colour) and, dotted, the months
 * still to go at the planned amount, against a dashed target line — all in the goal's
 * colour, with today as a ringed dot (its balance above it) and the end as a solid
 * one. Lines are drawn in a stretched SVG; dots and labels are HTML so they never
 * distort. `color` may be a hex or a CSS variable.
 */
export function ProjectionChart({
  past,
  future,
  target,
  color,
  targetLabel,
  todayLabel,
  todayValueLabel,
  startLabel,
  endLabel,
  ariaLabel,
  height,
  savedLabel,
  className,
}: {
  /** Balances up to and including today. */
  past: number[];
  /** Balances after today, step by step. */
  future: number[];
  target: number;
  color: string;
  targetLabel: string;
  todayLabel: string;
  /** Today's balance, shown above today's dot. */
  todayValueLabel?: string;
  startLabel: string | null;
  endLabel: string | null;
  ariaLabel: string;
  /** A fixed plot height in px; without it the plot fills its parent (at least 150px). */
  height?: number;
  /** When set, today's balance is drawn as a band across the chart ("already saved"),
   *  so a goal that starts with money in it reads as partly done. */
  savedLabel?: string;
  className?: string;
}) {
  const series = [...past, ...future];
  const max = Math.max(target, ...series, 1);
  const n = series.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * 100);
  // The top 22% stays free for the target's label.
  const y = (v: number) => 100 - (Math.max(0, v) / max) * 78;
  const pts = series.map((v, i) => [x(i), y(v)] as const);
  const line = (p: readonly (readonly [number, number])[]) => p.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(2)} ${py.toFixed(2)}`).join(" ");
  const pastPts = pts.slice(0, past.length);
  const futurePts = pts.slice(Math.max(0, past.length - 1));
  const today = pastPts[pastPts.length - 1] ?? [0, 100];
  const end = futurePts.length > 1 ? futurePts[futurePts.length - 1] : null;
  const targetY = target > 0 ? y(target) : null;
  const showTodayLabel = today[0] > 14 && today[0] < 86;
  // The target line and its label: the goal's colour, pulled towards the ink so the
  // label reads on the light wash (and on the dark one).
  const strong = `color-mix(in srgb, ${color} 62%, var(--clr-ink))`;
  // Today's balance sits above its dot, or below it when the dot is near the top.
  const valueBelow = today[1] < 40;
  const savedNow = past[past.length - 1] ?? 0;
  const savedY = savedLabel && savedNow > 0 ? y(savedNow) : null;

  return (
    <div role="img" aria-label={ariaLabel} className={cn("flex flex-col gap-2", className)}>
      <div className={cn("relative", height == null && "min-h-[150px] flex-1")} style={height != null ? { height } : undefined}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full overflow-visible">
          <line x1="0" x2="100" y1="100" y2="100" stroke={color} strokeOpacity={0.3} vectorEffect="non-scaling-stroke" />
          {savedY != null && (
            <>
              <rect x="0" y={savedY} width="100" height={100 - savedY} fill={color} fillOpacity={0.16} />
              <line x1="0" x2="100" y1={savedY} y2={savedY} stroke={color} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
            </>
          )}
          {targetY != null && (
            <line x1="0" x2="100" y1={targetY} y2={targetY} stroke={strong} strokeOpacity={0.45} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          )}
          {pastPts.length > 1 && <path d={`${line(pastPts)} L${today[0].toFixed(2)} 100 L0 100 Z`} fill={color} fillOpacity={0.14} />}
          {pastPts.length > 1 && (
            <path d={line(pastPts)} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
          {futurePts.length > 1 && (
            <path
              d={line(futurePts)}
              fill="none"
              stroke={color}
              strokeWidth={3}
              strokeDasharray="2 7"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {savedY != null && 100 - savedY > 14 && (
          <span className="absolute right-0 bottom-1 text-xs font-bold whitespace-nowrap" style={{ color: strong }}>
            <MoneyText>{savedLabel!}</MoneyText>
          </span>
        )}
        {targetY != null && (
          <span className="absolute left-0 -translate-y-full pb-1 text-xs font-bold whitespace-nowrap" style={{ top: `${targetY}%`, color: strong }}>
            <MoneyText>{targetLabel}</MoneyText>
          </span>
        )}
        {todayValueLabel && (
          <span
            aria-hidden
            className={cn(
              "absolute text-xs font-extrabold whitespace-nowrap tabular-nums text-clear-ink",
              valueBelow ? "pt-3" : "-translate-y-full pb-3",
              today[0] < 12 ? "translate-x-0" : today[0] > 88 ? "-translate-x-full" : "-translate-x-1/2",
            )}
            style={{ left: `${today[0]}%`, top: `${today[1]}%` }}
          >
            <MoneyText>{todayValueLabel}</MoneyText>
          </span>
        )}
        <span
          aria-hidden
          className="absolute size-[15px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-clear-card"
          style={{ left: `${today[0]}%`, top: `${today[1]}%`, borderColor: color }}
        />
        {end && (
          <span
            aria-hidden
            className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${end[0]}%`, top: `${end[1]}%`, background: color }}
          />
        )}
      </div>
      <div aria-hidden className="relative flex h-4 justify-between gap-2 text-xs text-clear-ink-2">
        <span className="truncate">{startLabel ?? ""}</span>
        {showTodayLabel && (
          <span className="absolute -translate-x-1/2 font-bold whitespace-nowrap text-clear-ink" style={{ left: `${today[0]}%` }}>
            {todayLabel}
          </span>
        )}
        <span className="truncate font-bold text-clear-ink">{endLabel ?? ""}</span>
      </div>
    </div>
  );
}

/** A tidy round number at or above `n` for the top of a bar chart's scale. */
function niceCeil(n: number) {
  if (n <= 0) return 100;
  const step = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 4, 5, 8, 10]) if (m * step >= n) return m * step;
  return 10 * step;
}

/**
 * Twelve months of money put towards goals: a bar per month on a gridded scale, this
 * month in ember with its amount above it. Withdrawals draw as an empty month.
 */
export function ContributionBars({
  months,
  monthLabel,
  formatTick,
  formatValue,
  className,
}: {
  months: { month: string; amount: number }[];
  monthLabel: (month: string) => string;
  formatTick: (n: number) => string;
  formatValue: (n: number) => string;
  className?: string;
}) {
  const top = niceCeil(Math.max(0, ...months.map((m) => m.amount)));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => f * top);
  const last = months.length - 1;

  return (
    <div aria-hidden className={cn("flex min-h-[200px] pt-5 pl-11", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="relative flex-1">
          {ticks.map((v, i) => (
            <span key={v} className="absolute inset-x-0" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
              <span className={cn("block border-t", i === ticks.length - 1 ? "border-clear-line" : "border-dashed border-clear-ground")} />
              <span className="money absolute right-[calc(100%+8px)] -translate-y-1/2 text-xs leading-none whitespace-nowrap tabular-nums text-clear-muted">
                {formatTick(v)}
              </span>
            </span>
          ))}
          <div className="absolute inset-0 flex items-end gap-1.5 sm:gap-3">
            {months.map((m, i) => {
              const h = (Math.max(0, m.amount) / top) * 100;
              return (
                <div key={m.month} className="relative flex h-full min-w-0 flex-1 items-end justify-center" title={`${monthLabel(m.month)} · ${formatValue(m.amount)}`}>
                  {i === last && m.amount > 0 && (
                    <span className="absolute text-xs font-extrabold whitespace-nowrap tabular-nums" style={{ bottom: `calc(${h}% + 6px)` }}>
                      <MoneyText>{formatValue(m.amount)}</MoneyText>
                    </span>
                  )}
                  <span
                    className={cn("w-full max-w-[26px] rounded-[7px]", i === last ? "bg-clear-ember" : "bg-clear-info-fill")}
                    style={{ height: `${h}%`, minHeight: m.amount > 0 ? 4 : 0 }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex gap-1.5 sm:gap-3">
          {months.map((m, i) => (
            <span key={m.month} className={cn("min-w-0 flex-1 truncate text-center text-xs", i === last ? "font-bold text-clear-ink" : "text-clear-muted")}>
              {monthLabel(m.month)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The phone hero's small version: twelve bars, this month in ember. */
export function MiniBars({ months }: { months: { month: string; amount: number }[] }) {
  const max = Math.max(1, ...months.map((m) => m.amount));
  const last = months.length - 1;
  return (
    <div aria-hidden className="flex h-[54px] items-end gap-2 border-b border-clear-hero-ink/18 pb-px">
      {months.map((m, i) => (
        <span
          key={m.month}
          className={cn("min-w-0 flex-1 rounded-[4px]", i === last ? "bg-clear-ember" : i >= last - 3 ? "bg-clear-hero-ink" : "bg-clear-hero-ink/35")}
          style={{ height: `${(Math.max(0, m.amount) / max) * 100}%`, minHeight: m.amount > 0 ? 3 : 0 }}
        />
      ))}
    </div>
  );
}

/** The empty state's drawing: a jar of coins on a lilac circle. */
export function JarIllustration() {
  return (
    <svg viewBox="0 0 248 200" className="h-auto w-[200px] sm:w-[248px]" aria-hidden>
      <circle cx="124" cy="104" r="86" className="fill-clear-lilac" />
      <rect x="72" y="64" width="104" height="114" rx="28" strokeWidth="2.5" className="fill-clear-card stroke-clear-ink" />
      <circle cx="100" cy="134" r="11" strokeWidth="2.2" className="fill-clear-butter stroke-clear-ink" />
      <circle cx="124" cy="126" r="11" strokeWidth="2.2" className="fill-clear-butter stroke-clear-ink" />
      <circle cx="148" cy="136" r="11" strokeWidth="2.2" className="fill-clear-butter stroke-clear-ink" />
      <rect x="84" y="44" width="80" height="22" rx="8" strokeWidth="2.5" className="fill-clear-ember stroke-clear-ink" />
      <circle cx="124" cy="20" r="10" strokeWidth="2.2" className="fill-clear-butter stroke-clear-ink" />
      <circle cx="40" cy="64" r="6" className="fill-clear-peach" />
      <circle cx="226" cy="58" r="5" className="fill-clear-ember" />
    </svg>
  );
}

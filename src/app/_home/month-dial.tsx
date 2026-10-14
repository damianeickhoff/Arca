/**
 * The signature of the Home hero: the financial month as a dial. One tick per day of
 * the period, every fifth one longer; days already behind you in ink at 28%, the days
 * left in solid ink, and the count of days left in the middle. Drawn for the mustard
 * card, so the colours are the fixed ink, not theme tokens.
 */
export function MonthDial({
  totalDays,
  daysLeft,
  size,
  daysLabel,
  ariaLabel,
  className,
}: {
  totalDays: number;
  daysLeft: number;
  size: number;
  daysLabel: string;
  ariaLabel: string;
  className?: string;
}) {
  const ticks = Math.max(1, totalDays);
  const passed = Math.min(ticks, Math.max(0, ticks - daysLeft));
  const cx = size / 2;
  const r = size / 2 - 4;
  const marks = [];
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2 - Math.PI / 2;
    const inner = r - (i % 5 === 0 ? 9 : 6);
    marks.push(
      <line
        key={i}
        x1={(cx + Math.cos(a) * inner).toFixed(1)}
        y1={(cx + Math.sin(a) * inner).toFixed(1)}
        x2={(cx + Math.cos(a) * r).toFixed(1)}
        y2={(cx + Math.sin(a) * r).toFixed(1)}
        stroke={i < passed ? "rgba(30,26,20,0.28)" : "#1E1A14"}
        strokeWidth={2.5}
        strokeLinecap="round"
      />,
    );
  }

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0">
        {marks}
      </svg>
      <span className="flex flex-col items-center leading-none">
        <span className="amount text-[#1E1A14]" style={{ fontSize: Math.round(size * 0.3), letterSpacing: "-0.03em" }}>
          {daysLeft}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[rgba(30,26,20,0.7)]">{daysLabel}</span>
      </span>
    </span>
  );
}

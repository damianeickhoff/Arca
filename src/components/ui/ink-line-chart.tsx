// The house chart for a running total: an ink line over a mustard area fill, with
// dashed guide lines and a dot on the latest value. Pure SVG, scales to its container's
// width (height follows the aspect ratio).

/** An ink line over a mustard area fill — the house chart for a running total. */
export function InkLineChart({
  values,
  width = 560,
  height = 90,
  gradientId,
  grid = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  /** Unique per chart on the page — SVG gradient ids are document-global. */
  gradientId: string;
  grid?: boolean;
}) {
  if (values.length < 2) return null;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xy = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (width - pad * 2),
    height - pad - ((v - min) / span) * (height - pad * 2),
  ]);
  const d = xy.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L${xy[xy.length - 1][0].toFixed(1)} ${height} L${xy[0][0].toFixed(1)} ${height} Z`;
  const last = xy[xy.length - 1];
  const gridY = [0.33, 0.66].map((g) => (height - pad - g * (height - pad * 2)).toFixed(1));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} aria-hidden className="block h-auto w-full">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--arca-accent)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--arca-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid && gridY.map((y) => (
        <line key={y} x1="0" x2={width} y1={y} y2={y} stroke="var(--arca-line)" strokeDasharray="2 4" />
      ))}
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={d} fill="none" stroke="var(--arca-ink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="4" fill="var(--arca-ink)" stroke="var(--arca-surface)" strokeWidth="2" />
    </svg>
  );
}

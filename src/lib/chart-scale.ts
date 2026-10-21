// Round axis scales for the inline SVG charts (Insights › Trends and Net worth), so
// gridlines land on amounts people read at a glance (0, 2k, 4k, 6k).

/** A step of 1, 2, 2.5 or 5 × 10ⁿ at or above `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

/**
 * The axis for values between `lo` and `hi`: both widened to a multiple of a round
 * step (about `count` steps in all), zero always on the axis, and the ticks from the
 * bottom up. An empty or flat range still gets a usable axis.
 */
export function niceRange(lo: number, hi: number, count = 3): { lo: number; hi: number; step: number; ticks: number[] } {
  let min = Math.min(0, lo);
  let max = Math.max(0, hi);
  if (max - min < 1) max = min + 100;
  const step = niceStep((max - min) / count);
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { lo: min, hi: max, step, ticks };
}

/** "6k", "2,5k", "−25k", "0" — the tick labels, in the reader's number format. */
export function compactTick(value: number, locale: string): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const body = abs >= 1_000_000 ? `${fmt.format(abs / 1_000_000)}M` : abs >= 1000 ? `${fmt.format(abs / 1000)}k` : fmt.format(abs);
  return `${value < 0 ? "−" : ""}${body}`;
}

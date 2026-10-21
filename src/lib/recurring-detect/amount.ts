import { median, mode } from "./rhythm";

// The "steady amount" test. Fixed: every payment within 5% of the others. A price
// change: the last three agree and everything before them did too, so a subscription
// that went from €9,99 to €10,99 is fixed at €10,99. Variable (energy, water): all
// within 60% of the median and most within 25%. Anything else is ordinary spending.

export const FIXED_SPREAD = 0.05;
export const VARIABLE_MAX_DEVIATION = 0.6;
export const VARIABLE_CLOSE_DEVIATION = 0.25;
export const VARIABLE_CLOSE_SHARE = 0.7;

export type AmountResult =
  | { kind: "fixed"; amount: number; priceChanged: boolean }
  | { kind: "variable"; amount: number; min: number; max: number; closeShare: number };

function cents(value: number) {
  return Math.round(Math.abs(value) * 100);
}

function isFixed(amounts: number[]): boolean {
  const m = median(amounts);
  return m > 0 && (Math.max(...amounts) - Math.min(...amounts)) / m < FIXED_SPREAD;
}

/** Most common amount, to the cent. */
function typicalAmount(amounts: number[]): number {
  return mode(amounts.map(cents)) / 100;
}

/** A run of payments can change price this often (a yearly rise over a long history)
 *  and still count as fixed at the latest price. */
const MAX_PRICE_STEPS = 3;

/** Splits date-ordered amounts into runs that stay fixed. */
function priceSteps(amounts: number[]): number[][] {
  const steps: number[][] = [];
  for (const a of amounts) {
    const current = steps.at(-1);
    if (current && isFixed([...current, a])) current.push(a);
    else steps.push([a]);
  }
  return steps;
}

/** `amounts` in date order (oldest first), any sign. Null when the amounts aren't steady. */
export function classifyAmount(rawAmounts: number[]): AmountResult | null {
  const amounts = rawAmounts.map((a) => Math.abs(a));
  if (amounts.length === 0) return null;
  if (isFixed(amounts)) return { kind: "fixed", amount: typicalAmount(amounts), priceChanged: false };

  const steps = priceSteps(amounts);
  if (steps.length <= MAX_PRICE_STEPS && steps.at(-1)!.length >= 3) {
    return { kind: "fixed", amount: typicalAmount(steps.at(-1)!), priceChanged: true };
  }

  const m = median(amounts);
  if (m === 0) return null;
  const deviations = amounts.map((a) => Math.abs(a - m) / m);
  if (deviations.some((d) => d > VARIABLE_MAX_DEVIATION)) return null;
  const closeShare = deviations.filter((d) => d <= VARIABLE_CLOSE_DEVIATION).length / amounts.length;
  if (closeShare < VARIABLE_CLOSE_SHARE) return null;
  return {
    kind: "variable",
    amount: cents(m) / 100,
    min: cents(Math.min(...amounts)) / 100,
    max: cents(Math.max(...amounts)) / 100,
    closeShare,
  };
}

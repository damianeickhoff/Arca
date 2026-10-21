// Transaction fixtures for the recurring detector tests: one builder per shape the
// plan (docs/recurring-detection-plan.md) names. Every fixture is relative to TODAY.
import type { DetectTransaction } from "@/lib/recurring-detect";

export const TODAY = "2026-10-15";

let nextId = 1;

export function series(opts: {
  merchantId: number | null;
  merchantName?: string | null;
  counterAccount?: string | null;
  description: string | ((i: number) => string);
  dates: string[];
  amounts: number | number[];
  direction?: "income" | "expense";
}): DetectTransaction[] {
  return opts.dates.map((date, i) => ({
    id: nextId++,
    date,
    amount: Array.isArray(opts.amounts) ? opts.amounts[i] : opts.amounts,
    direction: opts.direction ?? "expense",
    description: typeof opts.description === "function" ? opts.description(i) : opts.description,
    merchantId: opts.merchantId,
    merchantName: opts.merchantName ?? null,
    counterAccount: opts.counterAccount ?? null,
  }));
}

/** 14 Albert Heijn visits in three months, at no rhythm and no steady amount. */
export const groceries = () =>
  series({
    merchantId: 1,
    merchantName: "Albert Heijn",
    description: (i) => `Albert Heijn ${1400 + i} Utrecht`,
    dates: [
      "2026-07-18", "2026-07-22", "2026-07-29", "2026-08-03", "2026-08-08", "2026-08-12", "2026-08-19",
      "2026-08-27", "2026-09-01", "2026-09-06", "2026-09-14", "2026-09-20", "2026-09-29", "2026-10-06",
    ],
    amounts: [23.4, 61.1, 12.95, 48.3, 35, 18.75, 72.4, 29.9, 41.15, 15.6, 55.8, 33.33, 26.45, 64],
  });

/** Six salaries on the 25th, give or take a day. */
export const salary = () =>
  series({
    merchantId: 2,
    merchantName: "Acme BV",
    description: "ACME BV SALARIS",
    dates: ["2026-04-24", "2026-05-25", "2026-06-25", "2026-07-24", "2026-08-25", "2026-09-25"],
    amounts: 3200,
    direction: "income",
  });

/** A monthly energy bill whose amount moves between €92 and €138. */
export const energy = () =>
  series({
    merchantId: 3,
    merchantName: "Stroomnet",
    description: "Stroomnet termijn",
    dates: ["2026-05-03", "2026-06-03", "2026-07-02", "2026-08-04", "2026-09-03", "2026-10-02"],
    amounts: [92, 104, 118, 138, 121, 99],
  });

/** Water every 90 days. */
export const water = () =>
  series({
    merchantId: 4,
    merchantName: "Waterbedrijf Noord",
    description: "Waterbedrijf Noord voorschot",
    dates: ["2025-11-10", "2026-02-08", "2026-05-09", "2026-08-07"],
    amounts: 54.2,
  });

/** Car insurance, once a year. */
export const carInsurance = () =>
  series({
    merchantId: 5,
    merchantName: "Autoverzekering Plus",
    description: "Autoverzekering Plus polis",
    dates: ["2025-03-14", "2026-03-13"],
    amounts: 612.4,
  });

/** Nine Tikkies to different people, all different amounts. */
export const tikkies = () =>
  series({
    merchantId: 6,
    merchantName: "Tikkie",
    description: (i) => `Tikkie ${["Sanne", "Mark", "Lisa", "Tom", "Eva", "Bram", "Noor", "Daan", "Fleur"][i]}`,
    dates: [
      "2026-05-02", "2026-05-29", "2026-06-20", "2026-07-01", "2026-07-30",
      "2026-08-14", "2026-08-31", "2026-09-17", "2026-10-03",
    ],
    amounts: [12.5, 240, 8, 33.1, 75, 5.5, 19.99, 140, 47],
  });

/** A subscription that went from €9,99 (four times) to €10,99 (three times). */
export const priceRise = () =>
  series({
    merchantId: 7,
    merchantName: "StreamFlix",
    description: "StreamFlix abonnement",
    dates: ["2026-03-12", "2026-04-12", "2026-05-12", "2026-06-12", "2026-07-12", "2026-08-12", "2026-09-12"],
    amounts: [9.99, 9.99, 9.99, 9.99, 10.99, 10.99, 10.99],
  });

/** A gym paid monthly until five months ago. */
export const stoppedGym = () =>
  series({
    merchantId: 8,
    merchantName: "Fitlab",
    description: "Fitlab lidmaatschap",
    dates: ["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"],
    amounts: 29.95,
  });

/** One merchant: a €4,99 monthly membership, plus ordinary orders in between. */
export const shopWithSubscription = () => {
  const membership = series({
    merchantId: 9,
    merchantName: "Bol",
    description: "Bol.com Select lidmaatschap",
    dates: ["2026-04-05", "2026-05-05", "2026-06-05", "2026-07-05", "2026-08-05", "2026-09-05", "2026-10-05"],
    amounts: 4.99,
  });
  const orders = series({
    merchantId: 9,
    merchantName: "Bol",
    description: (i) => `Bol.com bestelling ${8100 + i}`,
    dates: ["2026-04-18", "2026-05-09", "2026-06-27", "2026-08-02", "2026-09-21"],
    amounts: [23.99, 59, 14.5, 89.95, 31.2],
  });
  return { membership, orders };
};

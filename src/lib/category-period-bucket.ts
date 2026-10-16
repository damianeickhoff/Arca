import type { CategoryPeriodPreset } from "@/components/category-period-picker";

export type BucketUnit = "day" | "week" | "month";

/** The category detail's history chart always shows exactly 6 bars, but their
 * granularity follows the selected period: a Week (or a weekly budget period) buckets
 * by day, Month by week, a monthly budget period and anything longer by month — so
 * the default view reads "the last six months" against the monthly budget. Shared
 * between the client fetch (the API needs the unit) and the chart's labels. */
export function bucketUnitFor(preset: CategoryPeriodPreset, rangeDays: number): BucketUnit {
  if (preset === "week") return "day";
  if (preset === "month") return "week";
  if (preset === "budget") return rangeDays <= 9 ? "day" : "month";
  return "month";
}

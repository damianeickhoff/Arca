import type { CategoryPeriodPreset } from "@/components/category-period-picker";

export type BucketUnit = "day" | "week" | "month";

/** The Avg-spent card always shows exactly 6 bars, but their granularity follows the
 * selected period: a Week (or a short Budget period) buckets by day, Month by week,
 * anything longer by month. Shared between the client fetch (needs the unit to ask
 * the API for the right buckets) and the label row underneath the bars. */
export function bucketUnitFor(preset: CategoryPeriodPreset, rangeDays: number): BucketUnit {
  if (preset === "week") return "day";
  if (preset === "month") return "week";
  if (preset === "budget") return rangeDays <= 9 ? "day" : "week";
  return "month";
}

export function formatBucketLabel(key: string, unit: BucketUnit): string {
  if (unit === "day") {
    return new Date(`${key}T00:00:00`).toLocaleDateString("en-GB", { weekday: "narrow" });
  }
  if (unit === "week") {
    return String(new Date(`${key}T00:00:00`).getDate());
  }
  return new Date(`${key}-01T00:00:00`).toLocaleDateString("en-GB", { month: "narrow" });
}

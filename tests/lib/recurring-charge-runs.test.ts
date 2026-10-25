// Breaks in a recurring item's charge history (src/lib/recurring-charge-runs.ts), pure:
// the period per frequency, the median fallback, the gap rule and the run starts.
import { describe, expect, it } from "vitest";
import { chargePeriodDays, chargeRunStarts, isChargeGap } from "@/lib/recurring-charge-runs";

const monthlyFrom = (year: number, firstMonth: number, count: number, day = 15) =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, firstMonth - 1 + i, day));
    return d.toISOString().slice(0, 10);
  });

describe("chargePeriodDays", () => {
  it("uses the frequency's period when it has one", () => {
    expect(chargePeriodDays([], "weekly")).toBe(7);
    expect(chargePeriodDays([], "four_weekly")).toBe(28);
    expect(chargePeriodDays([], "monthly")).toBeCloseTo(30.44, 1);
    expect(chargePeriodDays([], "yearly")).toBeCloseTo(365.25, 2);
  });

  it("falls back to the median interval without a usable frequency", () => {
    const dates = ["2026-01-01", "2026-01-08", "2026-01-15", "2026-03-01"];
    expect(chargePeriodDays(dates)).toBe(7);
    expect(chargePeriodDays(dates, "once")).toBe(7);
    expect(chargePeriodDays(["2026-01-01", "2026-01-31", "2026-03-02", "2026-04-01"], "custom")).toBe(30);
  });

  it("has no period for a single charge without a frequency", () => {
    expect(chargePeriodDays(["2026-01-01"])).toBeNull();
  });

  it("never returns less than a day, even for same-day charges", () => {
    expect(chargePeriodDays(["2026-01-01", "2026-01-01", "2026-01-01"])).toBe(1);
  });
});

describe("isChargeGap", () => {
  const monthly = 365.25 / 12;

  it("lets a late or a single skipped monthly charge pass", () => {
    expect(isChargeGap(35, monthly)).toBe(false);
    expect(isChargeGap(62, monthly)).toBe(false);
    expect(isChargeGap(76, monthly)).toBe(false);
  });

  it("calls two or more missed monthly charges a break", () => {
    expect(isChargeGap(77, monthly)).toBe(true);
    expect(isChargeGap(90, monthly)).toBe(true);
    expect(isChargeGap(210, monthly)).toBe(true);
  });

  it("scales with the period", () => {
    expect(isChargeGap(14, 7)).toBe(false);
    expect(isChargeGap(21, 7)).toBe(true);
    expect(isChargeGap(182, 365.25 / 4)).toBe(true);
    expect(isChargeGap(400, 365.25)).toBe(false);
    expect(isChargeGap(730, 365.25)).toBe(true);
  });

  it("gives daily charges a weekend's slack", () => {
    expect(isChargeGap(3, 1)).toBe(false);
    expect(isChargeGap(5, 1)).toBe(true);
  });
});

describe("chargeRunStarts", () => {
  it("is empty for no charges and one run for one charge", () => {
    expect(chargeRunStarts([], "monthly")).toEqual([]);
    expect(chargeRunStarts(["2026-01-15"], "monthly")).toEqual([0]);
    expect(chargeRunStarts(["2026-01-15"])).toEqual([0]);
  });

  it("keeps an unbroken monthly series as one run", () => {
    expect(chargeRunStarts(monthlyFrom(2025, 1, 12), "monthly")).toEqual([0]);
  });

  it("splits a cancelled and restarted subscription (Netflix: stop in Feb, back in Sep)", () => {
    const dates = [...monthlyFrom(2024, 11, 4), ...monthlyFrom(2025, 9, 2)];
    // 2024-11, 2024-12, 2025-01, 2025-02 | 2025-09, 2025-10
    expect(chargeRunStarts(dates, "monthly")).toEqual([0, 4]);
  });

  it("finds every break", () => {
    const dates = ["2024-01-10", "2024-02-10", "2024-06-10", "2024-07-10", "2025-01-10"];
    expect(chargeRunStarts(dates, "monthly")).toEqual([0, 2, 4]);
  });

  it("does not split on one missed month", () => {
    const dates = ["2025-01-31", "2025-02-28", "2025-04-30", "2025-05-31"];
    expect(chargeRunStarts(dates, "monthly")).toEqual([0]);
  });

  it("uses the median rhythm without a frequency", () => {
    const dates = [...monthlyFrom(2025, 1, 5), ...monthlyFrom(2025, 10, 2)];
    expect(chargeRunStarts(dates)).toEqual([0, 5]);
  });

  it("is not fooled by DST when counting days", () => {
    // Weekly across the spring-forward night in Europe: never a break.
    expect(chargeRunStarts(["2026-03-22", "2026-03-29", "2026-04-05"], "weekly")).toEqual([0]);
  });
});

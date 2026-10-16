// The forecast verdict with an overdraft: a dip inside the limit is not a shortfall, and
// whether it is even a warning depends on whether the overdraft counts as spendable.
import { describe, expect, it } from "vitest";
import { firstShortPoint, judgeForecast, safetyLine } from "@/lib/cash-flow-forecast-shared";

const none = { overdraftLimit: 0, overdraftMode: "buffer" as const };
const buffer = { overdraftLimit: 500, overdraftMode: "buffer" as const };
const spendable = { overdraftLimit: 500, overdraftMode: "spendable" as const };

describe("judgeForecast", () => {
  it("keeps the old behaviour without an overdraft", () => {
    expect(judgeForecast(-1, 500, none)).toEqual({ status: "critical", reason: "short" });
    expect(judgeForecast(100, 500, none)).toEqual({ status: "warning", reason: "low" });
    expect(judgeForecast(600, 500, none)).toEqual({ status: "healthy", reason: "fine" });
  });

  it("treats a dip inside the overdraft as a warning when it is a safety net", () => {
    expect(judgeForecast(-200, 500, buffer)).toEqual({ status: "warning", reason: "inOverdraft" });
    expect(judgeForecast(-500, 500, buffer)).toEqual({ status: "warning", reason: "inOverdraft" });
    expect(judgeForecast(-501, 500, buffer)).toEqual({ status: "critical", reason: "pastLimit" });
    expect(judgeForecast(100, 500, buffer)).toEqual({ status: "warning", reason: "low" });
  });

  it("measures the safety margin from the limit when the overdraft is spendable", () => {
    expect(safetyLine(500, spendable)).toBe(0);
    expect(judgeForecast(100, 500, spendable)).toEqual({ status: "healthy", reason: "fine" });
    expect(judgeForecast(-200, 500, spendable)).toEqual({ status: "warning", reason: "nearLimit" });
    expect(judgeForecast(-200, 200, spendable)).toEqual({ status: "healthy", reason: "fine" });
    expect(judgeForecast(-600, 200, spendable)).toEqual({ status: "critical", reason: "pastLimit" });
  });
});

describe("firstShortPoint", () => {
  const points = [
    { date: "2026-11-01", amount: 100 },
    { date: "2026-11-02", amount: -300 },
    { date: "2026-11-03", amount: -700 },
  ];

  it("finds the first day below zero without an overdraft", () => {
    expect(firstShortPoint(points, 0)?.date).toBe("2026-11-02");
  });

  it("finds the first day past the limit with one", () => {
    expect(firstShortPoint(points, 500)?.date).toBe("2026-11-03");
    expect(firstShortPoint(points, 1000)).toBeNull();
  });
});

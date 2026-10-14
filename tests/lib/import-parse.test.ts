// Characterisation tests for the manual column-mapping helpers (pure, no DB).
import { describe, expect, it } from "vitest";
import { buildCustomDateParser, parseAmount, parseDate } from "@/lib/import-parse";
import { guessBalanceColumn } from "@/lib/import-columns";

describe("parseAmount", () => {
  it("reads comma-decimal amounts with dot thousands", () => {
    expect(parseAmount("1.234,56", ",")).toBe(1234.56);
    expect(parseAmount("+12,5", ",")).toBe(12.5);
    expect(parseAmount("-0,015", ",")).toBe(-0.01);
  });

  it("reads dot-decimal amounts with comma thousands", () => {
    expect(parseAmount("1,234.56", ".")).toBe(1234.56);
    expect(parseAmount(" -9.999 ", ".")).toBe(-10);
  });

  it("returns NaN for unreadable input rather than throwing", () => {
    expect(Number.isNaN(parseAmount("abc", "."))).toBe(true);
  });
});

describe("parseDate", () => {
  it("parses iso, dmy and mdy, padding single digits", () => {
    expect(parseDate("2026-3-2", "iso")).toBe("2026-03-02");
    expect(parseDate("2026/03/02 10:00", "iso")).toBe("2026-03-02");
    expect(parseDate("2-3-2026", "dmy")).toBe("2026-03-02");
    expect(parseDate("3/2/2026", "mdy")).toBe("2026-03-02");
  });

  it("returns null for blanks, wrong shapes and impossible dates", () => {
    expect(parseDate("", "iso")).toBeNull();
    expect(parseDate("Albert Heijn", "dmy")).toBeNull();
    expect(parseDate("31-02-2026", "dmy")).toBeNull();
    expect(parseDate("2026-13-01", "iso")).toBeNull();
  });

  it("supports custom patterns with any separator and two-digit years", () => {
    expect(parseDate("02.03.2026", "custom", "DD.MM.YYYY")).toBe("2026-03-02");
    expect(parseDate("26|3|2", "custom", "YY|MM|DD")).toBe("2026-03-02");
    expect(parseDate("02.03.2026", "custom", null)).toBeNull();
  });

  it("buildCustomDateParser reports token order", () => {
    expect(buildCustomDateParser("MM/DD/YYYY").order).toEqual(["MM", "DD", "YYYY"]);
  });
});

describe("guessBalanceColumn", () => {
  it("finds the first header matching the most specific pattern first", () => {
    expect(guessBalanceColumn(["Datum", "Bedrag", "Saldo na mutatie"])).toBe(2);
    expect(guessBalanceColumn(["Balance", "Resulting balance"])).toBe(1);
    expect(guessBalanceColumn(["Datum", "Bedrag"])).toBeNull();
  });
});

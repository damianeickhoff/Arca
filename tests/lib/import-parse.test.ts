// Characterisation tests for the manual column-mapping helpers (pure, no DB).
import { describe, expect, it } from "vitest";
import { buildCustomDateParser, detectCsvLayout, parseAmount, parseDate, resolveHeaderRow } from "@/lib/import-parse";
import { guessBalanceColumn } from "@/lib/import-columns";

describe("detectCsvLayout", () => {
  it("keeps the first line as header for a plain export", () => {
    expect(detectCsvLayout(["Date,Description,Amount", "2026-07-01,Coffee,-3.50", "2026-07-02,Salary,2500.00"])).toEqual({ delimiter: ",", headerRow: 0 });
  });

  it("skips a DKB-style account summary above the column names", () => {
    const lines = [
      '"Girokonto";"DE12 1203 0000 1234 5678 90"',
      '"Zeitraum:";"01.07.2026 - 22.07.2026"',
      '"Kontostand vom 22.07.2026:";"1.234,56 €"',
      '"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Betrag (€)"',
      '"22.07.26";"22.07.26";"Gebucht";"Max Muster";"REWE";"Einkauf, Filiale 12";"-12,34"',
      '"21.07.26";"21.07.26";"Gebucht";"Firma GmbH";"Max Muster";"Gehalt";"2.500,00"',
    ];
    expect(detectCsvLayout(lines)).toEqual({ delimiter: ";", headerRow: 3 });
  });

  it("finds the header through unquoted preamble lines without any delimiter", () => {
    const lines = ["Kontoumsätze", "Export vom 22.07.2026", "Datum;Text;Betrag", "01.07.2026;Miete;-800,00", "02.07.2026;Lohn;2000,00"];
    expect(detectCsvLayout(lines)).toEqual({ delimiter: ";", headerRow: 2 });
  });

  it("accepts a header one field short of rows that end in a delimiter", () => {
    expect(detectCsvLayout(["Date;Name;Amount", "01-07-2026;A;1;", "02-07-2026;B;2;", "03-07-2026;C;3;"]).headerRow).toBe(0);
  });

  it("does not split on decimal commas inside a semicolon file", () => {
    expect(detectCsvLayout(["Datum;Naam;Bedrag;Saldo", "01-07-2026;A;-1,50;10,00", "02-07-2026;B;2,00;12,00"]).delimiter).toBe(";");
  });

  it("falls back to the first line for a file with a single column", () => {
    expect(detectCsvLayout(["just text", "more text"])).toEqual({ delimiter: expect.any(String), headerRow: 0 });
  });
});

describe("resolveHeaderRow", () => {
  const lines = ["Konto;DE12", "Datum;Text;Betrag", "01.07.2026;Miete;-800,00", "02.07.2026;Lohn;2000,00"];

  it("uses the mapping's row when it points inside the file", () => {
    expect(resolveHeaderRow(lines, { headerRow: 0 })).toBe(0);
    expect(resolveHeaderRow(lines, { headerRow: 2 })).toBe(2);
  });

  it("detects the row for profiles saved without one or with a bad value", () => {
    expect(resolveHeaderRow(lines, {})).toBe(1);
    expect(resolveHeaderRow(lines, { headerRow: null })).toBe(1);
    expect(resolveHeaderRow(lines, { headerRow: 9 })).toBe(1);
    expect(resolveHeaderRow(lines, { headerRow: -1 })).toBe(1);
  });
});

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

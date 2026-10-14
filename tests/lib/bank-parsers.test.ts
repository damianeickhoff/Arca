// Characterisation tests: these pin what the CSV parsers do TODAY, not what they
// should do. A failing assertion here means behaviour changed — decide whether that
// was intended before updating the expectation.
//
// The per-bank `hash` values are pinned on purpose: importHash is the duplicate key for
// every row already in a user's database, so any change to a hash formula makes the next
// re-import of an old statement insert every row a second time.
import { describe, expect, it } from "vitest";
import { BANK_PARSERS, detectAndParse } from "@/lib/bank-parsers";
import {
  cleanLines,
  ddmmyyyyToISO,
  guessDelimiter,
  isoDateOnly,
  parseLocaleAmount,
  parseReportedBalance,
  splitDelimited,
} from "@/lib/bank-parsers/types";

const BOM = "﻿";

describe("shared parser helpers", () => {
  it("cleanLines strips a BOM, trims and splits on CRLF and LF", () => {
    expect(cleanLines(`${BOM}a\r\nb\nc\n\n`)).toEqual(["a", "b", "c"]);
  });

  it("parseLocaleAmount decides the decimal separator by whichever comes last", () => {
    expect(parseLocaleAmount("1.234,56")).toBe(1234.56);
    expect(parseLocaleAmount("1,234.56")).toBe(1234.56);
    expect(parseLocaleAmount("+12,50")).toBe(12.5);
    expect(parseLocaleAmount("-12,50")).toBe(-12.5);
    expect(parseLocaleAmount("42")).toBe(42);
    expect(Number.isNaN(parseLocaleAmount("abc"))).toBe(true);
  });

  it("parseReportedBalance returns null for missing, empty or non-numeric cells", () => {
    expect(parseReportedBalance(undefined)).toBeNull();
    expect(parseReportedBalance(null)).toBeNull();
    expect(parseReportedBalance("   ")).toBeNull();
    expect(parseReportedBalance("n/a")).toBeNull();
    expect(parseReportedBalance("1.234,56")).toBe(1234.56);
    expect(parseReportedBalance("-10.5")).toBe(-10.5);
  });

  it("ddmmyyyyToISO converts d-m-yyyy and d/m/yyyy, and passes anything else through", () => {
    expect(ddmmyyyyToISO("2-3-2026")).toBe("2026-03-02");
    expect(ddmmyyyyToISO("02/03/2026")).toBe("2026-03-02");
    expect(ddmmyyyyToISO("2026-03-02")).toBe("2026-03-02");
    expect(ddmmyyyyToISO("garbage")).toBe("garbage");
  });

  it("isoDateOnly drops a time component and passes non-ISO values through", () => {
    expect(isoDateOnly("2026-03-02 10:23:45")).toBe("2026-03-02");
    expect(isoDateOnly("02-03-2026")).toBe("02-03-2026");
  });

  it("guessDelimiter picks the separator that yields the most fields", () => {
    expect(guessDelimiter("a;b;c,d")).toBe(";");
    expect(guessDelimiter("a\tb\tc")).toBe("\t");
    expect(guessDelimiter("a,b,c")).toBe(",");
  });

  it("splitDelimited honours quotes and doubled-quote escapes, and trims fields", () => {
    expect(splitDelimited('"a, b",c , "say ""hi"""', ",")).toEqual(["a, b", "c", 'say "hi"']);
    expect(splitDelimited("a;;b", ";")).toEqual(["a", "", "b"]);
  });
});

describe("parser registry", () => {
  it("tries parsers in a fixed order", () => {
    expect(BANK_PARSERS.map((p) => p.key)).toEqual(["ing", "rabobank", "abn-amro", "bunq", "revolut", "knab"]);
  });

  it("returns null for a file no parser recognises", () => {
    expect(detectAndParse("foo,bar,baz\n1,2,3")).toBeNull();
    expect(detectAndParse("")).toBeNull();
  });
});

describe("ING", () => {
  const dutch = [
    `${BOM}"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen";"Saldo na mutatie";"Tag"`,
    `"20260302";"Albert Heijn 1234";"NL11INGB0001234567";"";"BA";"Af";"23,45";"Betaalautomaat";"Pasvolgnr: 001 02-03-2026 18:04";"1.234,56";""`,
    `"20260301";"Werkgever BV";"NL11INGB0001234567";"NL22ABNA0123456789";"OV";"Bij";"2.500,00";"Overschrijving";"Salaris maart";"3.734,56";""`,
    `"20260301";"Te kort";"NL11INGB0001234567"`,
    ``,
  ].join("\r\n");

  it("detects and parses a Dutch semicolon export", () => {
    const result = detectAndParse(dutch);
    expect(result?.bankKey).toBe("ing");
    expect(result?.label).toBe("ING");
    const rows = result!.rows;
    // Short rows (fewer than 9 fields) are skipped silently.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      date: "2026-03-02",
      name: "Albert Heijn 1234",
      account: "NL11INGB0001234567",
      counterAccount: "",
      code: "BA",
      direction: "expense",
      amount: 23.45,
      type: "Betaalautomaat",
      description: "Pasvolgnr: 001 02-03-2026 18:04",
    });
    // ING has a "Saldo na mutatie" column, but the built-in parser does not read it.
    expect(rows[0].reportedBalance).toBeUndefined();
    expect(rows[1]).toMatchObject({
      date: "2026-03-01",
      name: "Werkgever BV",
      counterAccount: "NL22ABNA0123456789",
      direction: "income",
      amount: 2500,
      description: "Salaris maart",
    });
    expect(rows[0].hash).toMatchInlineSnapshot(`"6748ef407dc7c4e6"`);
  });

  it("parses an English tab-separated export, using the name when Notifications is empty", () => {
    const quoted = (cells: string[]) => cells.map((c) => `"${c}"`).join("\t");
    const english = [
      quoted(["Date", "Name / Description", "Account", "Counterparty", "Code", "Debit/credit", "Amount (EUR)", "Transaction type", "Notifications"]),
      quoted(["20260310", "NS Reizigers", "NL11INGB0001234567", "", "BA", "Debit", "4,10", "Payment terminal", ""]),
      quoted(["20260311", "Refund shop", "NL11INGB0001234567", "", "OV", "Credit", "15,00", "Transfer", "Refund"]),
    ].join("\n");
    const rows = detectAndParse(english)!.rows;
    expect(rows.map((r) => [r.date, r.direction, r.amount, r.description])).toEqual([
      ["2026-03-10", "expense", 4.1, "NS Reizigers"],
      ["2026-03-11", "income", 15, "Refund"],
    ]);
  });

  it("imports an unquoted tab-separated row whose last field is empty", () => {
    // The trailing tab is the empty Notifications column; it must survive line handling
    // so the row keeps all 9 fields.
    const english = [
      ["Date", "Name / Description", "Account", "Counterparty", "Code", "Debit/credit", "Amount (EUR)", "Transaction type", "Notifications"].join("\t"),
      ["20260310", "NS Reizigers", "NL11INGB0001234567", "", "BA", "Debit", "4,10", "Payment terminal", ""].join("\t"),
      ["20260311", "Refund shop", "NL11INGB0001234567", "", "OV", "Credit", "15,00", "Transfer", "Refund"].join("\t"),
    ].join("\n");
    const rows = detectAndParse(english)!.rows;
    expect(rows.map((r) => [r.name, r.amount, r.description])).toEqual([
      ["NS Reizigers", 4.1, "NS Reizigers"],
      ["Refund shop", 15, "Refund"],
    ]);
  });

  it("reads EU amounts with thousands, dot-decimal amounts, and keeps them unsigned", () => {
    const head = `"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen"`;
    const row = (amount: string) => `"20260302";"Shop";"NL11INGB0001234567";"";"BA";"Af";"${amount}";"x";"m"`;
    const amounts = ["1.234,56", "23,45", "23.45", "0,05", "-12,30"].map((a) => detectAndParse(`${head}\n${row(a)}`)!.rows[0].amount);
    expect(amounts).toEqual([1234.56, 23.45, 23.45, 0.05, 12.3]);
  });

  it("does not claim a header whose first column is not the date", () => {
    const ing = BANK_PARSERS.find((p) => p.key === "ing")!;
    expect(ing.detect('"IBAN/BBAN","Datum","Tegenrekening IBAN/BBAN"', "")).toBe(false);
  });

  it("throws when there is no Datum/Date header", () => {
    const ing = BANK_PARSERS.find((p) => p.key === "ing")!;
    expect(() => ing.parse("foo;bar\n1;2")).toThrow(/No header found/);
  });
});

describe("Rabobank", () => {
  const header =
    '"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Naam uiteindelijke partij","Naam initiërende partij","BIC tegenpartij","Code","Batch ID","Transactiereferentie","Machtigingskenmerk","Incassant ID","Betalingskenmerk","Omschrijving-1","Omschrijving-2","Omschrijving-3","Reden retour","Oorspronkelijk bedrag","Oorspronkelijke munt","Koers"';
  const line = (date: string, amount: string, balance: string, name: string, d1: string, d2 = "", d3 = "") =>
    [
      "NL33RABO0123456789", "EUR", "RABONL2U", "000000000000001234", date, date, amount, balance,
      "NL44INGB0009876543", name, "", "", "INGBNL2A", "bg", "", "", "", "", "", d1, d2, d3, "", "", "", "",
    ].map((v) => `"${v}"`).join(",");

  const rabobank = BANK_PARSERS.find((p) => p.key === "rabobank")!;
  const parse = (csv: string) => rabobank.parse(csv);

  it("is auto-detected as Rabobank, not ING", () => {
    // The header contains "Datum" and "Tegenrekening IBAN/BBAN"; ING used to claim it
    // because it is tried first, then threw "No header found".
    const csv = [header, line("2026-03-02", "-23,45", "+1.234,56", "Jumbo", "Boodschappen")].join("\n");
    expect(BANK_PARSERS.find((p) => p.key === "ing")!.detect(header, csv)).toBe(false);
    const result = detectAndParse(csv)!;
    expect(result.bankKey).toBe("rabobank");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ amount: 23.45, direction: "expense", reportedBalance: 1234.56 });
  });

  it("parses a quoted comma export with a dot-decimal amount", () => {
    const csv = [header, line("2026-03-02", "-23.45", "+1234.56", "Jumbo", "Boodschappen", "week 9"), line("20260303", "+100.00", "1334.56", "", "Terugbetaling")].join("\n");
    const result = { rows: parse(csv) };
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      date: "2026-03-02",
      name: "Jumbo",
      account: "NL33RABO0123456789",
      counterAccount: "NL44INGB0009876543",
      code: "bg",
      type: "bg",
      direction: "expense",
      amount: 23.45,
      description: "Boodschappen week 9",
      reportedBalance: 1234.56,
    });
    // An 8-digit date is reformatted; an empty counterparty name falls back to the description.
    expect(result.rows[1]).toMatchObject({ date: "2026-03-03", name: "Terugbetaling", direction: "income", amount: 100 });
    expect(result.rows[0].hash).toMatchInlineSnapshot(`"725c66d7ef412332"`);
  });

  it("reads comma-decimal and thousands-separated amounts with their sign", () => {
    const cases: [string, number, string][] = [
      ["-23,45", 23.45, "expense"],
      ["+1.234,56", 1234.56, "income"],
      ["-1.234,56", 1234.56, "expense"],
      ["-0,99", 0.99, "expense"],
      ["+100.00", 100, "income"],
    ];
    for (const [raw, amount, direction] of cases) {
      const [row] = parse([header, line("2026-03-02", raw, "0,00", "Jumbo", "x")].join("\n"));
      expect([raw, row.amount, row.direction]).toEqual([raw, amount, direction]);
    }
  });

  it("skips rows with too few columns", () => {
    const csv = [header, '"NL33RABO0123456789","EUR"'].join("\n");
    expect(parse(csv)).toEqual([]);
  });
});

describe("ABN AMRO", () => {
  const txt = [
    '"NL12ABNA0123456789","EUR","20260301","20260302","1234.56","-23.45","NL98INGB0001234567","AH 1234 AMSTERDAM"',
    '"NL12ABNA0123456789","EUR","20260301","20260301","1258.01","2500.00","NL55RABO0123456789","SALARIS MAART"',
    '"not an abn line"',
  ].join("\n");

  it("detects the headerless layout by the shape of the first line", () => {
    const result = detectAndParse(txt)!;
    expect(result.bankKey).toBe("abn-amro");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      date: "2026-03-02",
      name: "AH 1234 AMSTERDAM",
      account: "NL12ABNA0123456789",
      counterAccount: "NL98INGB0001234567",
      code: "",
      direction: "expense",
      amount: 23.45,
      type: "",
      description: "AH 1234 AMSTERDAM",
      hash: result.rows[0].hash,
      reportedBalance: 1234.56,
    });
    expect(result.rows[1]).toMatchObject({ direction: "income", amount: 2500, date: "2026-03-01" });
    expect(result.rows[0].hash).toMatchInlineSnapshot(`"3964549b14b752cc"`);
  });

  it("reads comma-decimal and thousands-separated amounts with their sign", () => {
    const cases: [string, number, string][] = [
      ["-23,45", 23.45, "expense"],
      ["-1.234,56", 1234.56, "expense"],
      ["1.234,56", 1234.56, "income"],
      ["2500.00", 2500, "income"],
    ];
    for (const [raw, amount, direction] of cases) {
      const [row] = detectAndParse(
        `"NL12ABNA0123456789","EUR","20260301","20260302","1234,56","${raw}","NL98INGB0001234567","AH"`,
      )!.rows;
      expect([raw, row.amount, row.direction, row.reportedBalance]).toEqual([raw, amount, direction, 1234.56]);
    }
  });

  it("does not claim a file whose first line is not an ABN AMRO line", () => {
    const abn = BANK_PARSERS.find((p) => p.key === "abn-amro")!;
    expect(abn.detect("", "header,line\n" + txt)).toBe(false);
  });
});

describe("bunq", () => {
  const csv = [
    '"Datum";"Naam tegenpartij";"Rekeningnummer tegenpartij";"Rekeningnummer";"Bedrag";"Omschrijving"',
    '"02-03-2026";"Albert Heijn";"";"NL77BUNQ0123456789";"-1.023,45";"Boodschappen"',
    '"3-3-2026";"";"NL22ABNA0123456789";"NL77BUNQ0123456789";"+50,00";"Terugbetaling etentje"',
    '"04-03-2026";"Kort"',
  ].join("\n");

  it("detects and parses the semicolon export with EU amounts", () => {
    const result = detectAndParse(csv)!;
    expect(result.bankKey).toBe("bunq");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      date: "2026-03-02",
      name: "Albert Heijn",
      account: "NL77BUNQ0123456789",
      counterAccount: "",
      direction: "expense",
      amount: 1023.45,
      description: "Boodschappen",
    });
    expect(result.rows[0].reportedBalance).toBeUndefined();
    // Empty counterparty name falls back to the description.
    expect(result.rows[1]).toMatchObject({ date: "2026-03-03", name: "Terugbetaling etentje", direction: "income", amount: 50 });
    expect(result.rows[0].hash).toMatchInlineSnapshot(`"30939a3e8478aaf6"`);
  });

  it("reads comma-decimal, thousands-separated and dot-decimal amounts", () => {
    const head = '"Datum";"Naam tegenpartij";"Rekeningnummer tegenpartij";"Rekeningnummer";"Bedrag";"Omschrijving"';
    const cases: [string, number, string][] = [
      ["-23,45", 23.45, "expense"],
      ["-1.234,56", 1234.56, "expense"],
      ["+1.234,56", 1234.56, "income"],
      ["-23.45", 23.45, "expense"],
    ];
    for (const [raw, amount, direction] of cases) {
      const [row] = detectAndParse(`${head}\n"02-03-2026";"Shop";"";"NL77BUNQ0123456789";"${raw}";"x"`)!.rows;
      expect([raw, row.amount, row.direction]).toEqual([raw, amount, direction]);
    }
  });
});

describe("KNAB", () => {
  const header = "Rekeningnummer;Transactiedatum;Rentedatum;Bedrag;Omschrijving;Tegenrekeningnummer;Naam tegenrekening;Mutatiesoort;Mededelingen";

  it("detects and parses the semicolon export", () => {
    const csv = [
      header,
      "NL66KNAB0123456789;2026-03-02;2026-03-02;-23,45;x;NL98INGB0001234567;Coolblue;Betaling;Order 123",
      "NL66KNAB0123456789;2026-03-05;2026-03-05;250,00;x;;;Storting;",
    ].join("\n");
    const result = detectAndParse(csv)!;
    expect(result.bankKey).toBe("knab");
    expect(result.rows[0]).toMatchObject({
      date: "2026-03-02",
      name: "Coolblue",
      account: "NL66KNAB0123456789",
      counterAccount: "NL98INGB0001234567",
      direction: "expense",
      amount: 23.45,
      type: "Betaling",
      description: "Order 123",
    });
    // No name and no Mededelingen: both come out empty.
    expect(result.rows[1]).toMatchObject({ name: "", description: "", direction: "income", amount: 250 });
    expect(result.rows[0].hash).toMatchInlineSnapshot(`"dd3747122ccb1269"`);
  });

  it("reads thousands-separated and comma-decimal amounts with their sign", () => {
    const cases: [string, number, string][] = [
      ["-1.234,56", 1234.56, "expense"],
      ["-23,45", 23.45, "expense"],
      ["+1.234,56", 1234.56, "income"],
      ["12,5", 12.5, "income"],
    ];
    for (const [raw, amount, direction] of cases) {
      const csv = [header, `NL66KNAB0123456789;2026-03-02;2026-03-02;${raw};x;;Huur;Betaling;Huur maart`].join("\n");
      const [row] = detectAndParse(csv)!.rows;
      expect([raw, row.amount, row.direction]).toEqual([raw, amount, direction]);
    }
  });
});

describe("Revolut", () => {
  const csv = [
    "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
    "CARD_PAYMENT,Current,2026-03-02 10:23:45,2026-03-03 08:00:00,Spotify,-10.99,0.00,EUR,COMPLETED,489.01",
    "TOPUP,Current,2026-03-01 09:00:00,2026-03-01 09:00:01,Top-up by *1234,500.00,0.00,EUR,COMPLETED,500.00",
    "CARD_PAYMENT,Current,2026-03-04 11:00:00,,Pending shop,-5.00,0.00,EUR,PENDING,",
    "CARD_PAYMENT,Current,2026-03-05 11:00:00,2026-03-05 11:00:00,Old export,-1.00,0.00,EUR,COMPLETED",
  ].join("\n");

  it("parses completed rows only, using currency as the account", () => {
    const result = detectAndParse(csv)!;
    expect(result.bankKey).toBe("revolut");
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({
      date: "2026-03-02",
      name: "Spotify",
      account: "EUR",
      counterAccount: "",
      direction: "expense",
      amount: 10.99,
      reportedBalance: 489.01,
    });
    expect(result.rows[1]).toMatchObject({ direction: "income", amount: 500, reportedBalance: 500 });
    // A missing trailing balance column is null, not an error.
    expect(result.rows[2]).toMatchObject({ name: "Old export", reportedBalance: null });
    expect(result.rows[0].hash).toMatchInlineSnapshot(`"85fa394b1c537a01"`);
  });

  it("reads plain, thousands-separated (quoted) and comma-decimal amounts", () => {
    const head = "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance";
    const cases: [string, number, string][] = [
      ["-10.99", 10.99, "expense"],
      ["-1234.56", 1234.56, "expense"],
      ['"-1,234.56"', 1234.56, "expense"],
      ['"1.234,56"', 1234.56, "income"],
    ];
    for (const [raw, amount, direction] of cases) {
      const [row] = detectAndParse(`${head}\nCARD_PAYMENT,Current,2026-03-02 10:00:00,2026-03-02 10:00:00,Shop,${raw},0.00,EUR,COMPLETED,1.00`)!.rows;
      expect([raw, row.amount, row.direction]).toEqual([raw, amount, direction]);
    }
  });
});

describe("duplicate keys (importHash)", () => {
  it("is a 16-char hex digest that is stable for identical lines and differs otherwise", () => {
    const csv = [
      '"Datum";"Naam tegenpartij";"Rekeningnummer tegenpartij";"Rekeningnummer";"Bedrag";"Omschrijving"',
      '"02-03-2026";"Albert Heijn";"";"NL77BUNQ0123456789";"-12,00";"Boodschappen"',
      '"02-03-2026";"Albert Heijn";"";"NL77BUNQ0123456789";"-12,00";"Boodschappen"',
      '"02-03-2026";"Albert Heijn";"";"NL77BUNQ0123456789";"-12,01";"Boodschappen"',
    ].join("\n");
    const rows = detectAndParse(csv)!.rows;
    expect(rows[0].hash).toMatch(/^[0-9a-f]{16}$/);
    // Two genuinely identical purchases on the same day collide — the second is treated
    // as a duplicate on import. That is today's behaviour for every built-in parser.
    expect(rows[1].hash).toBe(rows[0].hash);
    expect(rows[2].hash).not.toBe(rows[0].hash);
  });

  it("does not depend on the account number for ING (it is not part of the key)", () => {
    const head = `"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen"`;
    const a = detectAndParse(`${head}\n"20260302";"Shop";"NL11INGB0001234567";"";"BA";"Af";"1,00";"x";"m"`)!.rows[0];
    const b = detectAndParse(`${head}\n"20260302";"Shop";"NL99INGB0007654321";"";"BA";"Af";"1,00";"x";"m"`)!.rows[0];
    expect(a.hash).toBe(b.hash);
  });
});

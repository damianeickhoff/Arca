import crypto from "crypto";
import { roundToCents } from "../transaction-splits";
import { cleanLines, ddmmyyyyToISO, parseLocaleAmount, splitDelimited, type BankParser, type ParsedRow } from "./types";

/**
 * bunq's CSV export (Dutch app locale). Semicolon-delimited, header:
 * "Datum";"Naam tegenpartij";"Rekeningnummer tegenpartij";"Rekeningnummer";"Bedrag";"Omschrijving"
 * Date is dd-mm-yyyy, amount uses a comma decimal separator with a leading sign.
 * Based on the commonly documented bunq CSV layout — spot-check against a real export
 * and adjust indices below if bunq has changed it.
 */
const COL = {
  date: 0,
  counterName: 1,
  counterAccount: 2,
  account: 3,
  amount: 4,
  description: 5,
};

export const bunqParser: BankParser = {
  key: "bunq",
  label: "bunq",

  detect(headerLine) {
    return headerLine.includes("Naam tegenpartij") && headerLine.includes("Rekeningnummer tegenpartij") && headerLine.includes("Rekeningnummer");
  },

  parse(raw: string): ParsedRow[] {
    const lines = cleanLines(raw);
    const headerIdx = lines.findIndex((l) => l.includes("Naam tegenpartij"));
    if (headerIdx === -1) throw new Error("No bunq header found");

    const headerLine = lines[headerIdx];
    const separator = headerLine.includes(";") ? ";" : ",";

    const rows: ParsedRow[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = splitDelimited(line, separator);
      if (cols.length <= COL.description) continue;

      const dateRaw = cols[COL.date];
      const amountRaw = cols[COL.amount];
      const amount = roundToCents(parseLocaleAmount(amountRaw));
      const description = cols[COL.description].trim();
      const name = cols[COL.counterName].trim() || description;

      const hash = crypto
        .createHash("sha256")
        .update(`${dateRaw}|${name}|${amountRaw}|${description}`)
        .digest("hex")
        .slice(0, 16);

      rows.push({
        date: ddmmyyyyToISO(dateRaw),
        name,
        account: cols[COL.account].trim(),
        counterAccount: cols[COL.counterAccount].trim(),
        code: "",
        direction: amount < 0 ? "expense" : "income",
        amount: Math.abs(amount),
        type: "",
        description: description || name,
        hash,
      });
    }
    return rows;
  },
};

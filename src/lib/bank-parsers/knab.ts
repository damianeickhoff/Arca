import crypto from "crypto";
import { roundToCents } from "../transaction-splits";
import { cleanLines, isoDateOnly, parseLocaleAmount, splitDelimited, type BankParser, type ParsedRow } from "./types";

/**
 * KNAB's CSV export. Semicolon-delimited, header:
 * Rekeningnummer;Transactiedatum;Rentedatum;Bedrag;Omschrijving;Tegenrekeningnummer;
 * Naam tegenrekening;Mutatiesoort;Mededelingen
 * Date is YYYY-MM-DD, amount uses a comma decimal separator with a leading sign.
 * Based on the commonly documented KNAB CSV layout — spot-check against a real export
 * and adjust indices below if KNAB has changed it.
 */
const COL = {
  account: 0,
  date: 1,
  amount: 3,
  counterAccount: 5,
  counterName: 6,
  type: 7,
  description: 8,
};

export const knabParser: BankParser = {
  key: "knab",
  label: "KNAB",

  detect(headerLine) {
    return headerLine.includes("Rekeningnummer") && headerLine.includes("Tegenrekeningnummer") && headerLine.includes("Mededelingen");
  },

  parse(raw: string): ParsedRow[] {
    const lines = cleanLines(raw);
    const headerIdx = lines.findIndex((l) => l.includes("Rekeningnummer"));
    if (headerIdx === -1) throw new Error("No KNAB header found");

    const headerLine = lines[headerIdx];
    const separator = headerLine.includes(";") ? ";" : ",";

    const rows: ParsedRow[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      // Not trim()med: on a tab-separated file that would also strip a trailing tab —
      // an empty last column — and the row would come up a field short and be dropped.
      // splitDelimited trims each field instead.
      const line = lines[i];
      if (!line.trim()) continue;

      const cols = splitDelimited(line, separator);
      if (cols.length <= COL.description) continue;

      const dateRaw = cols[COL.date].trim();
      const amountRaw = cols[COL.amount];
      // parseLocaleAmount handles the thousands separator too; swapping only the first
      // comma turned "1.234,56" into "1.234.56", which parsed as 1.234.
      const amount = roundToCents(parseLocaleAmount(amountRaw));
      const description = cols[COL.description].trim();
      const name = cols[COL.counterName].trim() || description;

      const hash = crypto
        .createHash("sha256")
        .update(`${dateRaw}|${name}|${amountRaw}|${description}`)
        .digest("hex")
        .slice(0, 16);

      rows.push({
        date: isoDateOnly(dateRaw),
        name,
        account: cols[COL.account].trim(),
        counterAccount: cols[COL.counterAccount].trim(),
        code: "",
        direction: amount < 0 ? "expense" : "income",
        amount: Math.abs(amount),
        type: cols[COL.type].trim(),
        description: description || name,
        hash,
      });
    }
    return rows;
  },
};

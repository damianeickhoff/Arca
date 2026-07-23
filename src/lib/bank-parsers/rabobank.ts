import crypto from "crypto";
import { roundToCents } from "../transaction-splits";
import { cleanLines, isoDateOnly, splitDelimited, type BankParser, type ParsedRow } from "./types";

/**
 * Rabobank's "CSV boekingsregels" export. Comma-delimited, quoted fields, header:
 * "IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn",
 * "Tegenrekening IBAN/BBAN","Naam tegenpartij","Naam uiteindelijke partij",
 * "Naam initiërende partij","BIC tegenpartij","Code","Batch ID","Transactiereferentie",
 * "Machtigingskenmerk","Incassant ID","Betalingskenmerk","Omschrijving-1","Omschrijving-2",
 * "Omschrijving-3","Reden retour","Oorspronkelijk bedrag","Oorspronkelijke munt","Koers"
 *
 * Column layout based on Rabobank's publicly documented export format — spot-check
 * against a real downloaded export and adjust indices below if Rabobank has changed it.
 */
const COL = {
  account: 0,
  date: 4,
  amount: 6,
  counterAccount: 8,
  name: 9,
  code: 13,
  desc1: 19,
  desc2: 20,
  desc3: 21,
};

export const rabobankParser: BankParser = {
  key: "rabobank",
  label: "Rabobank",

  detect(headerLine) {
    return headerLine.includes("IBAN/BBAN") && headerLine.includes("Volgnr") && headerLine.includes("Rentedatum");
  },

  parse(raw: string): ParsedRow[] {
    const lines = cleanLines(raw);
    const headerIdx = lines.findIndex((l) => l.includes("IBAN/BBAN"));
    if (headerIdx === -1) throw new Error("No Rabobank header found");

    const rows: ParsedRow[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = splitDelimited(line, ",");
      if (cols.length <= COL.desc3) continue;

      const dateRaw = cols[COL.date];
      const amountRaw = cols[COL.amount];
      const amount = roundToCents(parseFloat(amountRaw));
      const description = [cols[COL.desc1], cols[COL.desc2], cols[COL.desc3]]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ");
      const name = cols[COL.name].trim() || description;

      const hash = crypto
        .createHash("sha256")
        .update(`${dateRaw}|${name}|${amountRaw}|${description}`)
        .digest("hex")
        .slice(0, 16);

      rows.push({
        date: isoDateOnly(dateRaw.length === 8 ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}` : dateRaw),
        name,
        account: cols[COL.account].trim(),
        counterAccount: cols[COL.counterAccount].trim(),
        code: cols[COL.code].trim(),
        direction: amount < 0 ? "expense" : "income",
        amount: Math.abs(amount),
        type: cols[COL.code].trim(),
        description: description || name,
        hash,
      });
    }
    return rows;
  },
};

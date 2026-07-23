import crypto from "crypto";
import { roundToCents } from "../transaction-splits";
import { cleanLines, isoDateOnly, splitDelimited, type BankParser, type ParsedRow } from "./types";

/**
 * Revolut's "Export statement" CSV, comma-delimited, header:
 * Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
 * Dates look like "2024-01-15 10:23:45", amount is signed with a dot decimal separator.
 * Revolut has no IBAN/account-number concept in this export — Currency stands in for
 * "account" so multi-currency imports still get grouped sensibly.
 */
const COL = {
  startedDate: 2,
  description: 4,
  amount: 5,
  currency: 7,
  state: 8,
};

export const revolutParser: BankParser = {
  key: "revolut",
  label: "Revolut",

  detect(headerLine) {
    return headerLine.includes("Started Date") && headerLine.includes("Completed Date") && headerLine.includes("Product");
  },

  parse(raw: string): ParsedRow[] {
    const lines = cleanLines(raw);
    const headerIdx = lines.findIndex((l) => l.includes("Started Date"));
    if (headerIdx === -1) throw new Error("No Revolut header found");

    const rows: ParsedRow[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = splitDelimited(line, ",");
      if (cols.length <= COL.state) continue;

      // Skip non-completed transactions (pending/reverted/declined) — nothing to book yet.
      if (cols[COL.state].trim().toUpperCase() !== "COMPLETED") continue;

      const dateRaw = cols[COL.startedDate];
      const amountRaw = cols[COL.amount];
      const amount = roundToCents(parseFloat(amountRaw));
      const description = cols[COL.description].trim();
      const currency = cols[COL.currency].trim();

      const hash = crypto
        .createHash("sha256")
        .update(`${dateRaw}|${description}|${amountRaw}|${currency}`)
        .digest("hex")
        .slice(0, 16);

      rows.push({
        date: isoDateOnly(dateRaw),
        name: description,
        account: currency,
        counterAccount: "",
        code: "",
        direction: amount < 0 ? "expense" : "income",
        amount: Math.abs(amount),
        type: "",
        description,
        hash,
      });
    }
    return rows;
  },
};

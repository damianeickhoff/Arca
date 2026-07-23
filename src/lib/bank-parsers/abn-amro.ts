import crypto from "crypto";
import { roundToCents } from "../transaction-splits";
import { cleanLines, splitDelimited, type BankParser, type ParsedRow } from "./types";

/**
 * ABN AMRO's plain-text export has NO header row — each line is 8 comma-separated,
 * double-quoted fields:
 * "IBAN","EUR","YYYYMMDD","YYYYMMDD","balance after","amount","counter IBAN","description"
 * (account, currency, interest date, transaction date, balance, signed amount,
 * counter-account, description). Based on the commonly documented ABN AMRO TXT/CSV
 * layout — spot-check against a real export and adjust indices below if needed.
 */
const COL = {
  account: 0,
  date: 3,
  balance: 4,
  amount: 5,
  counterAccount: 6,
  description: 7,
};

function isAbnLine(cols: string[]): boolean {
  if (cols.length !== 8) return false;
  return /^NL\d{2}[A-Z]{4}\d{10}$/.test(cols[COL.account]) && /^\d{8}$/.test(cols[COL.date]);
}

export const abnAmroParser: BankParser = {
  key: "abn-amro",
  label: "ABN AMRO",

  detect(_headerLine, raw) {
    // No real header — check the first data line's shape instead.
    const firstLine = cleanLines(raw).find((l) => l.trim());
    if (!firstLine) return false;
    return isAbnLine(splitDelimited(firstLine.trim(), ","));
  },

  parse(raw: string): ParsedRow[] {
    const lines = cleanLines(raw);
    const rows: ParsedRow[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const cols = splitDelimited(trimmed, ",");
      if (!isAbnLine(cols)) continue;

      const dateRaw = cols[COL.date];
      const amountRaw = cols[COL.amount];
      const amount = roundToCents(parseFloat(amountRaw));
      const description = cols[COL.description].trim();

      const hash = crypto
        .createHash("sha256")
        .update(`${dateRaw}|${amountRaw}|${description}|${cols[COL.counterAccount]}`)
        .digest("hex")
        .slice(0, 16);

      rows.push({
        date: `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`,
        name: description,
        account: cols[COL.account].trim(),
        counterAccount: cols[COL.counterAccount].trim(),
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

import crypto from "crypto";
import { ingDateToISO } from "../format";
import { roundToCents } from "../transaction-splits";
import { cleanLines, parseLocaleAmount, splitDelimited, type BankParser, type ParsedRow } from "./types";

/**
 * ING's CSV export. Columns: Datum, Naam / Omschrijving, Rekening, Tegenrekening,
 * Code, Af Bij, Bedrag (EUR), Mutatiesoort, Mededelingen. Tab- or semicolon-delimited
 * (language-dependent), Dutch or English headers.
 */
function isIngHeaderStart(line: string): boolean {
  const t = line.trim().replace(/^"/, "");
  return t.startsWith("Datum") || t.startsWith("Date");
}

function findHeaderIndex(lines: string[]): number {
  return lines.findIndex(isIngHeaderStart);
}

export const ingParser: BankParser = {
  key: "ing",
  label: "ING",

  detect(headerLine) {
    // The date has to be the FIRST column, exactly as parse() requires. Merely containing
    // "Datum" claimed Rabobank's header too ("…","Datum",…,"Tegenrekening IBAN/BBAN"),
    // and since ING is tried first, every Rabobank file then failed with "No header found".
    const hasDateCol = isIngHeaderStart(headerLine);
    const hasIngMarker =
      headerLine.includes("Af Bij") ||
      headerLine.includes("Tegenrekening") ||
      headerLine.includes("Mededelingen") ||
      headerLine.includes("Debit/credit") ||
      headerLine.includes("Counterparty") ||
      headerLine.includes("Notifications");
    return hasDateCol && hasIngMarker;
  },

  parse(raw: string): ParsedRow[] {
    const lines = cleanLines(raw);
    const headerIdx = findHeaderIndex(lines);
    if (headerIdx === -1) {
      const preview = JSON.stringify(lines[0]?.slice(0, 80));
      throw new Error(`No header found in CSV. First line: ${preview}`);
    }

    const headerLine = lines[headerIdx];
    const separator = headerLine.includes("\t") ? "\t" : ";";

    const rows: ParsedRow[] = [];

    for (let i = headerIdx + 1; i < lines.length; i++) {
      // Not trim()med: on a tab-separated file that would also strip a trailing tab —
      // an empty last column — and the row would come up a field short and be dropped.
      // splitDelimited trims each field instead.
      const line = lines[i];
      if (!line.trim()) continue;

      const cols = splitDelimited(line, separator);
      if (cols.length < 9) continue;

      const [dateRaw, name, account, counterAccount, code, afBij, bedragRaw, mutatiesoort, mededelingen] = cols;

      const date = ingDateToISO(dateRaw.trim());
      // ING writes amounts unsigned (Af/Bij carries the direction) and EU-style
      // ("1.234,56"); parseLocaleAmount also reads a dot-decimal export correctly.
      const amount = Math.abs(roundToCents(parseLocaleAmount(bedragRaw)));
      const afBijNorm = afBij.trim().toLowerCase();
      const direction: "income" | "expense" =
        afBijNorm === "bij" || afBijNorm === "credit" ? "income" : "expense";

      const hash = crypto
        .createHash("sha256")
        .update(`${dateRaw}|${name}|${bedragRaw}|${afBij}|${mededelingen}`)
        .digest("hex")
        .slice(0, 16);

      rows.push({
        date,
        name: name.trim(),
        account: account.trim(),
        counterAccount: counterAccount.trim(),
        code: code.trim(),
        direction,
        amount,
        type: mutatiesoort.trim(),
        description: mededelingen.trim() || name.trim(),
        hash,
      });
    }

    return rows;
  },
};

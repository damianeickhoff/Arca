import crypto from "crypto";
import { ingAmountToNumber, ingDateToISO } from "../format";
import { roundToCents } from "../transaction-splits";
import { cleanLines, splitDelimited, type BankParser, type ParsedRow } from "./types";

/**
 * ING's CSV export. Columns: Datum, Naam / Omschrijving, Rekening, Tegenrekening,
 * Code, Af Bij, Bedrag (EUR), Mutatiesoort, Mededelingen. Tab- or semicolon-delimited
 * (language-dependent), Dutch or English headers.
 */
function findHeaderIndex(lines: string[]): number {
  return lines.findIndex((l) => {
    const t = l.trim().replace(/^"/, "");
    return t.startsWith("Datum") || t.startsWith("Date");
  });
}

export const ingParser: BankParser = {
  key: "ing",
  label: "ING",

  detect(headerLine) {
    const hasDateCol = headerLine.includes("Datum") || headerLine.includes("Date");
    const hasIngMarker = headerLine.includes("Af Bij") || headerLine.includes("Tegenrekening") || headerLine.includes("Mededelingen");
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
      const line = lines[i].trim();
      if (!line) continue;

      const cols = splitDelimited(line, separator);
      if (cols.length < 9) continue;

      const [dateRaw, name, account, counterAccount, code, afBij, bedragRaw, mutatiesoort, mededelingen] = cols;

      const date = ingDateToISO(dateRaw.trim());
      const amount = roundToCents(ingAmountToNumber(bedragRaw.trim()));
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

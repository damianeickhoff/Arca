export interface ParsedRow {
  date: string; // ISO YYYY-MM-DD
  name: string;
  account: string;
  counterAccount: string;
  code: string;
  direction: "income" | "expense";
  amount: number;
  type: string;
  description: string;
  hash: string;
}

export interface BankParser {
  key: string;
  label: string;
  // Given the raw file text (already BOM-stripped) and the line identified as the
  // header row, decide whether this parser can handle the file.
  detect(headerLine: string, raw: string): boolean;
  parse(raw: string): ParsedRow[];
}

/** Strip a UTF-8 BOM and normalise Windows line endings — shared by every parser. */
export function cleanLines(raw: string): string[] {
  const cleaned = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return cleaned.trim().split(/\r?\n/);
}

/** "1.234,56" (EU) or "1,234.56" (US) -> 1234.56, based on which char is the last separator. */
export function parseLocaleAmount(amountStr: string): number {
  const s = amountStr.trim().replace(/^\+/, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // Comma is the decimal separator; dots (if any) are thousands separators.
    return parseFloat(s.replace(/\./g, "").replace(",", "."));
  }
  // Dot is the decimal separator (or no separator at all); commas are thousands separators.
  return parseFloat(s.replace(/,/g, ""));
}

/** dd-mm-yyyy / dd/mm/yyyy -> yyyy-mm-dd */
export function ddmmyyyyToISO(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!m) return dateStr;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** yyyy-mm-dd (optionally with a time component) -> yyyy-mm-dd */
export function isoDateOnly(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : dateStr;
}

/** Guess a CSV's delimiter from its header line: whichever of ; \t , splits it into the most fields. */
export function guessDelimiter(headerLine: string): string {
  return [";", "\t", ","].sort(
    (a, b) => headerLine.split(b).length - headerLine.split(a).length
  )[0];
}

/** Split a delimited line into fields, honoring double-quoted fields (with "" escaping). */
export function splitDelimited(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // A doubled quote inside a quoted field is an escaped literal quote.
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (line.startsWith(delimiter, i) && !inQuotes) {
      result.push(current.trim());
      current = "";
      i += delimiter.length - 1;
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

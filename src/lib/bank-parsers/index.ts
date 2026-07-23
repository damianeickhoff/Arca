import { abnAmroParser } from "./abn-amro";
import { bunqParser } from "./bunq";
import { ingParser } from "./ing";
import { knabParser } from "./knab";
import { rabobankParser } from "./rabobank";
import { revolutParser } from "./revolut";
import { cleanLines, type BankParser, type ParsedRow } from "./types";

export type { ParsedRow, BankParser } from "./types";

// Order matters only in the unlikely case two parsers both claim to match — more
// specific/well-known formats first.
export const BANK_PARSERS: BankParser[] = [
  ingParser,
  rabobankParser,
  abnAmroParser,
  bunqParser,
  revolutParser,
  knabParser,
];

/** Best-effort "header line" for detect() — the first non-empty line, mirroring how
 * each individual parser previously searched for its own header inside parse(). ABN
 * AMRO's headerless format ignores this and inspects `raw` directly instead. */
function findLikelyHeaderLine(raw: string): string {
  return cleanLines(raw).find((l) => l.trim()) ?? "";
}

export function detectAndParse(raw: string): { bankKey: string; label: string; rows: ParsedRow[] } | null {
  const headerLine = findLikelyHeaderLine(raw);
  for (const parser of BANK_PARSERS) {
    if (parser.detect(headerLine, raw)) {
      return { bankKey: parser.key, label: parser.label, rows: parser.parse(raw) };
    }
  }
  return null;
}

import { TRANSACTION_INFO_FIELDS } from "@/config/transactionInfoFields";

/**
 * Extracts one field's value out of a raw bank description string.
 * Finds `matchPattern` (case-insensitive), then takes everything after it up to the
 * next colon in the string, minus the single word immediately before that colon (the
 * start of the following "Label:" token) — e.g. for "Naam: Amazon EU SARL
 * Omschrijving: D01-..." and matchPattern "Naam:", this returns "Amazon EU SARL".
 *
 * Note: bank descriptions occasionally use two-word labels (e.g. "Machtiging ID:").
 * Since only the single word directly before the colon is excluded, the first word of
 * a two-word label ("Machtiging") ends up attached to the previous field's value. This
 * matches the requested algorithm exactly; work around it, if needed, by choosing a
 * matchPattern for the affected field that starts after the ambiguous label instead.
 */
export function extractInfoFieldValue(rawDescription: string, matchPattern: string): string | null {
  const idx = rawDescription.toLowerCase().indexOf(matchPattern.toLowerCase());
  if (idx === -1) return null;

  const start = idx + matchPattern.length;
  const nextColon = rawDescription.indexOf(":", start);

  let end = rawDescription.length;
  if (nextColon !== -1) {
    const before = rawDescription.slice(start, nextColon);
    const lastWordStart = before.search(/\s\S*$/);
    end = lastWordStart === -1 ? start : start + lastWordStart;
  }

  const value = rawDescription.slice(start, end).trim();
  return value || null;
}

export interface MatchedTransactionInfoField {
  key: string;
  label: string;
  value: string;
}

/**
 * Runs every configured field against a transaction's raw description. The
 * "Transaction info" section this feeds is meant to stay entirely absent — no
 * placeholder, no empty card — until at least one field actually matches, so this
 * returns an empty array (not a list of blanks) when nothing matches.
 */
export function getMatchedTransactionInfoFields(rawDescription: string | null | undefined): MatchedTransactionInfoField[] {
  if (!rawDescription) return [];
  const results: MatchedTransactionInfoField[] = [];
  for (const field of TRANSACTION_INFO_FIELDS) {
    const value = extractInfoFieldValue(rawDescription, field.matchPattern);
    if (value) results.push({ key: field.key, label: field.label, value });
  }
  return results;
}

// Extra fields shown in a transaction's detail dialog, parsed out of the raw bank
// description (the "Mededelingen" column of the CSV import — transactions.rawDescription).
// Bank descriptions are often a run of "Label: value Label2: value2 ..." pairs, e.g.:
//   "Naam: Amazon EU SARL Omschrijving: D01-8852725 IBAN: IE30CITI... Kenmerk: ..."
//
// Each entry below pulls one such label out. `matchPattern` is matched
// case-insensitively against the raw description; the extracted value is everything
// after it up to (but not including) the next "Label:"-shaped token. If the pattern
// isn't found in a given transaction, that field is simply skipped for it.
//
// The whole "Transaction info" section is hidden by default and only appears on a
// transaction where at least one field below actually matched — add entries here to
// turn it on.
export interface TransactionInfoField {
  key: string;
  label: string;
  matchPattern: string;
}

export const TRANSACTION_INFO_FIELDS: TransactionInfoField[] = [
  { key: "description", label: "Omschrijving", matchPattern: "Omschrijving:" },
  { key: "name", label: "Naam", matchPattern: "Naam:" },
];

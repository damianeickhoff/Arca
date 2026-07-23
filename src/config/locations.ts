// Default description-pattern -> location name mappings. Checked before the
// generic Dutch-bank-description parser in src/lib/parse-transaction-location.ts,
// so known abbreviations/aliases resolve to a clean location name instead of
// whatever the best-effort heuristic would otherwise guess.
export interface LocationRule {
  pattern: string;
  location: string;
}

export const LOCATION_PATTERNS: LocationRule[] = [
  { pattern: "a'dam", location: "Amsterdam" },
  { pattern: "den haag", location: "Den Haag" },
  { pattern: "s gravenhage", location: "Den Haag" },
];

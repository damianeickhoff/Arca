// Best-effort location + merchant extraction from Dutch bank transaction descriptions.
// Dutch card transactions usually end with "... CITY CITY NLD" or "... CITY NLD".
// The city often appears twice (e.g. "Jumbo Lienden Lienden NLD", "ALDI CUL009 TIEL TIEL NLD").

import { LOCATION_PATTERNS } from "@/config/locations";

export type ParsedLocation = { query: string; city: string; label: string; merchant: string };

const COUNTRY_CODES = new Set([
  "NLD", "NL", "BEL", "BE", "DEU", "DE", "FRA", "FR", "GBR", "UK",
  "USA", "US", "ESP", "ES", "ITA", "IT", "LUX", "LU", "AUT", "AT",
]);

const CITY_PREFIXES = new Set(["DEN", "'S", "'T", "AAN", "OP"]);

// Tokens that appear in bank descriptions but are never merchant names.
const SKIP_TOKENS = new Set([
  // Dutch terminal / payment codes
  "BEA", "GEA", "CCV", "OVB", "OPD", "NFS", "CHIPKNIP", "NR",
  // Payment networks
  "SEPA", "IDEAL", "INCASSO", "ACCEPTGIRO", "MAESTRO", "VISA", "MASTERCARD",
  // Card/sequence prefixes (e.g. "Card Sequence Number 123 MERCHANT NLD")
  "CARD", "SEQUENCE", "NUMBER", "DEBIT", "CREDIT", "PURCHASE", "POS",
  // Dutch banking words that indicate the type of transaction, not the merchant
  "BETALING", "OVERBOEKING", "STORTING", "OPNAME", "AFSCHRIJVING",
  "INLEG", "BIJSCHRIJVING", "TERUGBOEKING",
  // Prepositions that appear after the above
  "VIA", "AAN", "VAN", "DOOR",
  // English equivalents
  "PAYMENT", "TRANSFER", "ONLINE",
]);

// Legal-entity suffixes that trail a company name and should not be part of the brand.
// e.g. "Albert Heijn B.V." → strip "B.V." → "Albert Heijn"
const COMPANY_SUFFIXES = new Set([
  "BV", "NV", "VOF", "CV", "LTD", "INC", "SA", "AG", "GMBH", "PLC", "CO", "CORP", "GROUP",
]);

// "2switch" → "2Switch": a word that starts with digits gets its first letter capitalised.
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(\d+)([a-z])/g, (_, digits: string, c: string) => digits + c.toUpperCase());
}

// A brand written with a leading digit ("2Switch", "2theloo"). Store codes and
// reference numbers ("1451", "CUL009", "EV2348", "I82611") never look like this.
function isDigitBrand(token: string): boolean {
  return /^\d{1,2}[a-zA-Z]{3,}$/.test(token);
}

function isStoreCode(token: string): boolean {
  return /\d/.test(token) && !isDigitBrand(token);
}

function isWord(token: string): boolean {
  return /^[a-zA-Z]/.test(token) || isDigitBrand(token);
}

function isNoise(token: string): boolean {
  if (token.endsWith(":")) return true;          // label tokens: "Kaartnr:", "Omschrijving:"
  if (token.endsWith(".") && token.length <= 2) return true; // single-letter abbreviations: "a."
  if (isStoreCode(token)) return true;           // store codes / reference numbers
  if (SKIP_TOKENS.has(token.toUpperCase())) return true;
  return false;
}

function isCompanySuffix(token: string): boolean {
  // Strip all dots and check against suffix list: "B.V." → "BV", "Ltd." → "LTD"
  return COMPANY_SUFFIXES.has(token.toUpperCase().replace(/\./g, ""));
}

// Remove trailing company-suffix tokens from a brand token array.
// Always keeps at least one token so we don't erase the whole name.
function stripSuffixes(tokens: string[]): string[] {
  const result = [...tokens];
  while (result.length > 1 && isCompanySuffix(result[result.length - 1])) {
    result.pop();
  }
  return result;
}

export function parseTransactionLocation(description: string): ParsedLocation | null {
  if (!description) return null;

  // Configured overrides win over the generic heuristic below (e.g. known
  // abbreviations the parser would otherwise get wrong or miss entirely).
  const descLower = description.toLowerCase();
  for (const rule of LOCATION_PATTERNS) {
    if (descLower.includes(rule.pattern.toLowerCase())) {
      return { query: `${rule.location}, Nederland`, city: rule.location, label: rule.location, merchant: "" };
    }
  }

  return parseCardDescription(description);
}

// The generic "MERCHANT [CODE] CITY [CITY] NLD" parse, without the configured overrides.
function parseCardDescription(description: string): ParsedLocation | null {
  let s = description.replace(/\s+/g, " ").trim();
  s = s.replace(/\b(PAS(?:volgnr|nr)?|betaalpas|apple\s*pay|google\s*pay|contactloos)\b\.?/gi, " ");
  s = s.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{8,}\b/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  const tokens = s.split(" ").filter(Boolean);
  if (tokens.length === 0) return null;

  // Only parse Dutch-style descriptions that end with a country code.
  let end = tokens.length;
  const lastClean = tokens[end - 1].toUpperCase().replace(/[^A-Z]/g, "");
  if (!COUNTRY_CODES.has(lastClean)) return null;
  end -= 1;
  if (end <= 0) return null;

  // City = last remaining token, extended left for multi-word city names.
  let cityStart = end - 1;
  if (cityStart - 1 >= 0 && CITY_PREFIXES.has(tokens[cityStart - 1].toUpperCase())) {
    cityStart -= 1;
  }
  const city = tokens.slice(cityStart, end).join(" ");
  if (!/[a-zA-Z]/.test(city)) return null;

  // Dutch transactions often repeat the city: "Jumbo Lienden Lienden NLD".
  while (
    cityStart - 1 >= 0 &&
    tokens[cityStart - 1].toUpperCase() === tokens[cityStart].toUpperCase()
  ) {
    cityStart -= 1;
  }

  // Strip store/location codes (tokens containing digits) just before the city.
  while (cityStart - 1 >= 0 && isStoreCode(tokens[cityStart - 1])) {
    cityStart -= 1;
  }

  // Merchant = remaining leading tokens, filtered for noise, then company suffixes stripped.
  const rawMerchant = tokens
    .slice(0, cityStart)
    .filter((t) => isWord(t) && !isNoise(t))
    .slice(0, 4);

  const merchantTokens = stripSuffixes(rawMerchant).slice(0, 3);
  const merchant = merchantTokens.join(" ");
  const query = [merchant, city, "Nederland"].filter(Boolean).join(", ");
  const label = merchant ? `${titleCase(merchant)} · ${titleCase(city)}` : titleCase(city);
  return { query, city: titleCase(city), label, merchant: titleCase(merchant) };
}

// Extract the merchant/brand name from a raw bank transaction description.
export function extractMerchantName(description: string | null | undefined): string | null {
  if (!description) return null;

  // Try location-aware parsing first (handles "MERCHANT CITY CITY NLD" patterns). Its
  // merchant is whatever stands before the city; when nothing does ("1451 Lienden
  // Lienden NLD": a store number and the town) there is no merchant to find, and the
  // fallback below would only make one out of the town and the country code.
  const parsed = cardLine(description);
  if (parsed) return parsed.merchant || null;

  // Fallback: walk tokens left-to-right, skip leading noise, collect brand words.
  const tokens = description.trim().split(/\s+/);
  const brand: string[] = [];
  let skippedNoise = false;

  for (const t of tokens) {
    if (isNoise(t) || isCompanySuffix(t)) {
      if (brand.length === 0) { skippedNoise = true; continue; } // skip leading noise
      break; // stop collecting once we hit noise after brand words
    }
    if (!isWord(t)) break;
    brand.push(t);
    if (brand.length >= 3) break;
  }

  // Strip any trailing company suffix that slipped in before the loop stopped.
  const cleaned = stripSuffixes(brand);

  if (cleaned.length === 0) return null;
  // Reject single short words that were only found after skipping noise — likely noise too.
  if (skippedNoise && cleaned.length === 1 && cleaned[0].length <= 3) return null;

  return cleaned.map(capitalize).join(" ");
}

/** A description's card line parsed: the merchant before the town ("" when nothing
 *  stands there) and the town ("1451 Lienden LIENDEN NLD Pasvolgnr: …" → "", "Lienden"),
 *  or null when it has no card line. */
export function cardLine(description: string | null | undefined): ParsedLocation | null {
  if (!description) return null;
  return parseCardDescription(cardPart(description));
}

// A bank sync's raw description carries the card line with the payment details after it
// ("JD1601GammaTiel TIEL NLD Pasvolgnr: 906 …"): the part up to the first upper-case
// three-letter country code. Two-letter codes are left out, they are ordinary words too
// ("De Veerstoep").
function cardPart(description: string): string {
  const tokens = description.trim().split(/\s+/);
  const i = tokens.findIndex((t, idx) => idx > 0 && t.length === 3 && t === t.toUpperCase() && COUNTRY_CODES.has(t));
  return i < 0 ? description : tokens.slice(0, i + 1).join(" ");
}

// "ALBERT" → "Albert", "2SWITCH" → "2Switch".
function capitalize(word: string): string {
  const lower = word.toLowerCase();
  const i = lower.search(/[a-z]/);
  return i < 0 ? lower : lower.slice(0, i) + lower[i].toUpperCase() + lower.slice(i + 1);
}

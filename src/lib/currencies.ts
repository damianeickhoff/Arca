// A curated list of ISO 4217 currency codes covering the currencies the Frankfurter
// exchange-rate API (see src/app/api/exchange-rates/route.ts) actually returns, plus a
// few common non-ECB currencies shown for browsing even though rates for them may be
// unavailable. `country` is the ISO 3166-1 alpha-2 used to derive the flag emoji.
export interface CurrencyInfo {
  code: string;
  name: string;
  country: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: "AUD", name: "Australian Dollar", country: "AU" },
  { code: "BGN", name: "Bulgarian Lev", country: "BG" },
  { code: "BRL", name: "Brazilian Real", country: "BR" },
  { code: "CAD", name: "Canadian Dollar", country: "CA" },
  { code: "CHF", name: "Swiss Franc", country: "CH" },
  { code: "CNY", name: "Chinese Yuan", country: "CN" },
  { code: "CZK", name: "Czech Koruna", country: "CZ" },
  { code: "DKK", name: "Danish Krone", country: "DK" },
  { code: "EUR", name: "Euro", country: "EU" },
  { code: "GBP", name: "British Pound", country: "GB" },
  { code: "HKD", name: "Hong Kong Dollar", country: "HK" },
  { code: "HUF", name: "Hungarian Forint", country: "HU" },
  { code: "IDR", name: "Indonesian Rupiah", country: "ID" },
  { code: "ILS", name: "Israeli Shekel", country: "IL" },
  { code: "INR", name: "Indian Rupee", country: "IN" },
  { code: "ISK", name: "Icelandic Krona", country: "IS" },
  { code: "JPY", name: "Japanese Yen", country: "JP" },
  { code: "KRW", name: "South Korean Won", country: "KR" },
  { code: "MXN", name: "Mexican Peso", country: "MX" },
  { code: "MYR", name: "Malaysian Ringgit", country: "MY" },
  { code: "NOK", name: "Norwegian Krone", country: "NO" },
  { code: "NZD", name: "New Zealand Dollar", country: "NZ" },
  { code: "PHP", name: "Philippine Peso", country: "PH" },
  { code: "PLN", name: "Polish Zloty", country: "PL" },
  { code: "RON", name: "Romanian Leu", country: "RO" },
  { code: "SEK", name: "Swedish Krona", country: "SE" },
  { code: "SGD", name: "Singapore Dollar", country: "SG" },
  { code: "THB", name: "Thai Baht", country: "TH" },
  { code: "TRY", name: "Turkish Lira", country: "TR" },
  { code: "USD", name: "US Dollar", country: "US" },
  { code: "ZAR", name: "South African Rand", country: "ZA" },
  // Common currencies without a live rate from the free tier — shown for browsing;
  // the converter row falls back to "—" if no rate is available for them.
  { code: "AED", name: "UAE Dirham", country: "AE" },
  { code: "AFN", name: "Afghan Afghani", country: "AF" },
  { code: "ALL", name: "Albanian Lek", country: "AL" },
  { code: "AMD", name: "Armenian Dram", country: "AM" },
  { code: "ARS", name: "Argentine Peso", country: "AR" },
  { code: "AWG", name: "Aruban Florin", country: "AW" },
  { code: "AZN", name: "Azerbaijani Manat", country: "AZ" },
  { code: "DZD", name: "Algerian Dinar", country: "DZ" },
  { code: "AOA", name: "Angolan Kwanza", country: "AO" },
  { code: "EGP", name: "Egyptian Pound", country: "EG" },
  { code: "NGN", name: "Nigerian Naira", country: "NG" },
  { code: "PKR", name: "Pakistani Rupee", country: "PK" },
  { code: "SAR", name: "Saudi Riyal", country: "SA" },
  { code: "UAH", name: "Ukrainian Hryvnia", country: "UA" },
  { code: "VND", name: "Vietnamese Dong", country: "VN" },
];

const CURRENCY_BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function currencyInfo(code: string): CurrencyInfo | undefined {
  return CURRENCY_BY_CODE.get(code);
}

// Regional-indicator flag emoji from a 2-letter country code. "EU" isn't a real ISO
// country code but IS a defined emoji flag sequence, so it works here too.
export function flagEmoji(country: string): string {
  if (country.length !== 2) return "💱";
  const codePoints = [...country.toUpperCase()].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

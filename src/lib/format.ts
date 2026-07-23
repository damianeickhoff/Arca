// UI language is English; number formatting keeps Dutch (nl-NL) grouping ("1.234,56")
// because changing digit grouping / decimal separators in a finance app the family
// already reads is pure risk. Dates use en-GB for English month names with
// day-first ordering ("3 Jul 2026"), closest to the Dutch reading habit.

export type SupportedCurrencyCode = "EUR" | "USD" | "GBP";

export const SUPPORTED_CURRENCIES: { code: SupportedCurrencyCode; label: string; symbol: string }[] = [
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "GBP", label: "British Pound", symbol: "£" },
];

const CURRENCY_SYMBOLS: Record<SupportedCurrencyCode, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
};

function isSupportedCurrency(value: string): value is SupportedCurrencyCode {
  return value in CURRENCY_SYMBOLS;
}

// App-wide currency, set once at render time from the "default_currency" app setting
// (see src/lib/app-settings.ts + src/components/currency-sync.tsx). It's a single global
// preference (not per-user/per-request), so a shared module variable is safe here — every
// concurrent request wants the same value, and it only changes on an explicit settings save
// followed by router.refresh().
let currentCurrencyCode: SupportedCurrencyCode = "EUR";

export function setCurrentCurrency(code: string | null | undefined) {
  if (code && isSupportedCurrency(code)) currentCurrencyCode = code;
}

export function getCurrentCurrency(): SupportedCurrencyCode {
  return currentCurrencyCode;
}

export function currencySymbol(): string {
  return CURRENCY_SYMBOLS[currentCurrencyCode];
}

export function formatEur(amount: number, showSign = false): string {
  const numberPart = new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));

  // Sign goes after the currency symbol, not before it ("€-20,00", not "-€20,00").
  const sign = amount < 0 ? "-" : showSign && amount > 0 ? "+" : "";
  return `${currencySymbol()}${sign}${numberPart}`;
}

// Same as formatEur, but with a negative sign placed before the currency symbol
// instead of after it ("-€20,00", not "€-20,00") — used by the accounts
// card/page, where balances read more naturally with the sign leading.
export function formatEurSignFirst(amount: number): string {
  return amount < 0 ? `-${formatEur(-amount)}` : formatEur(amount);
}

// Short human label for a category rule's amount condition — exact amount, a range,
// or a one-sided bound. Returns null when the rule has no amount constraint.
export function ruleAmountLabel(rule: { amount?: number | null; amountMin?: number | null; amountMax?: number | null }): string | null {
  if (rule.amountMin != null || rule.amountMax != null) {
    if (rule.amountMin != null && rule.amountMax != null) return `${formatEur(rule.amountMin)}–${formatEur(rule.amountMax)}`;
    if (rule.amountMin != null) return `≥ ${formatEur(rule.amountMin)}`;
    return `≤ ${formatEur(rule.amountMax!)}`;
  }
  if (rule.amount != null) return formatEur(rule.amount);
  return null;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatMonth(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatMonthShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
  }).format(d);
}

export function toISODate(excelSerial: number): string {
  // Excel dates are days since 1900-01-01 (with the 1900 leap year bug)
  const d = new Date((excelSerial - 25569) * 86400 * 1000);
  return d.toISOString().split("T")[0];
}

export function ingDateToISO(dateStr: string): string {
  // ING format: YYYYMMDD
  if (dateStr.length !== 8) return dateStr;
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

export function ingAmountToNumber(amountStr: string): number {
  // ING uses comma as decimal separator: "1.234,56" -> 1234.56
  return parseFloat(amountStr.replace(/\./g, "").replace(",", "."));
}

// Keys are stored DB values (never rename); only the display labels are English.
export const GROUP_LABELS: Record<string, string> = {
  income: "Income",
  bill: "Bills",
  debt: "Debts",
  subscription: "Subscriptions",
  variable: "Variable expenses",
  savings: "Savings",
};

// "Income" is deliberately not a budget type here — a category's `group` already
// marks it as income; budgetType only classifies expense-side spending (needs/wants/
// savings). Any pre-existing "inkomen"/"Income" budgetType value is backfilled to
// null on boot (see src/db/index.ts).
export const BUDGET_TYPE_LABELS: Record<string, string> = {
  nodig: "Needs",
  willen: "Wants",
  sparen: "Savings",
};

// Budget types are stored inconsistently across the app: the edit form and the
// recurring seed write Dutch keys ("nodig"/"willen"/"sparen"), while the
// category seed (src/config/categories.ts) writes English ("Needs"/"Wants"/"Savings").
// Normalize both to the Dutch canonical key so filtering and label lookups work
// regardless of which vocabulary a given row happens to use.
export function normalizeBudgetType(value?: string | null): string {
  switch ((value ?? "").toLowerCase()) {
    case "nodig":
    case "needs":
    case "need":
      return "nodig";
    case "willen":
    case "wants":
    case "want":
      return "willen";
    case "sparen":
    case "savings":
    case "saving":
      return "sparen";
    default:
      return value ?? "";
  }
}

export function toMonthly(amount: number | null, frequency: string): number {
  if (!amount) return 0;
  switch (frequency) {
    case "yearly":    return amount / 12;
    case "quarterly": return amount / 3;
    case "weekly":    return amount * (52 / 12);
    case "daily":     return amount * (365 / 12);
    case "once":      return 0;
    default:       return amount; // monthly
  }
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Compact "€5K" style, used for tight spots (stat tiles, calendar cells) where the full
// amount string would wrap or overflow.
export function formatCompactEur(n: number): string {
  const formatted = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(n));
  return `${n < 0 ? "-" : ""}${currencySymbol()}${formatted}`;
}

// "+124%", "-38%", or "New" when the previous period had nothing to compare against.
// Shared by every page that shows a period-over-period change pill (Analytics, Trends,
// Net worth) so the "New"/null-when-nothing-to-compare rules stay consistent everywhere.
export function pctChangeLabel(current: number, previous: number): { label: string; up: boolean } | null {
  if (previous === 0) return current === 0 ? null : { label: "New", up: current > 0 };
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return { label: `${pct.toFixed(1)}%`, up: pct >= 0 };
}

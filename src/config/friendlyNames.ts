// Default description -> friendly display name mappings. Used as a fallback
// whenever a transaction has no manually-set customName, so raw bank
// descriptions (e.g. "AH TO GO 4192 AMSTERDAM NLD") show up as something
// readable ("Albert Heijn") without needing per-transaction editing.
export interface FriendlyNameRule {
  pattern: string;
  name: string;
}

export const FRIENDLY_NAMES: FriendlyNameRule[] = [
  { pattern: "albert heijn", name: "Albert Heijn" },
  { pattern: "ah to go", name: "Albert Heijn" },
  { pattern: "jumbo", name: "Jumbo Supermarkten" },
  { pattern: "lidl", name: "Lidl" },
  { pattern: "aldi", name: "Aldi" },
  { pattern: "plus", name: "Plus Supermarkten" },
  { pattern: "spotify", name: "Spotify" },
  { pattern: "netflix", name: "Netflix" },
  { pattern: "amazon", name: "Amazon" },
  { pattern: "bol.com", name: "Bol.com" },
  { pattern: "action", name: "Action" },
  { pattern: "Wibra", name: "Wibra" },
  { pattern: "paypal", name: "PayPal" },
  { pattern: "tikkie", name: "Tikkie" },
  { pattern: "Klarna", name: "Klarna" },
  { pattern: "Vodafone", name: "Vodafone" },
  { pattern: "Zeeman", name: "Zeeman" },
  { pattern: "Kik fil", name: "Kik" },
  { pattern: "Revolut", name: "Revolut" },
  { pattern: "Allianz", name: "Allianz Direct" },
  { pattern: "Geldmaat", name: "Geldmaat" },
  { pattern: "Groei 24", name: "Groei 24" },
  { pattern: "Intertoys", name: "Intertoys" },
  { pattern: "Kaufland", name: "Kaufland" },
  { pattern: "ns-groep", name: "NS" },
  { pattern: "shell", name: "Shell" },
  { pattern: "bp ", name: "BP" },
  { pattern: "hema", name: "HEMA" },
  { pattern: "Kruidvat", name: "Kruidvat Drogist" },
  { pattern: "Etos", name: "Etos Drogist" },
  { pattern: "McDonalds", name: "McDonald's" },
  { pattern: "mcd", name: "MCD Supermarkten" },
  { pattern: "Apple", name: "Apple" },
  { pattern: "Yellowbrick", name: "Yellowbrick" },
  { pattern: "Subway", name: "Subway" },
  
];

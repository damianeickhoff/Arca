// Curated list of merchants that are almost always recurring (subscriptions, utilities,
// insurers, telecom). The recurring detector (src/lib/detect-recurring.ts) creates an
// auto recurring item the first time it sees a matching transaction — no need to wait for
// the frequency heuristic to accumulate several months. Same shape/spirit as FRIENDLY_NAMES.
export interface RecurringMerchant {
  /** case-insensitive substring matched against the transaction description */
  pattern: string;
  /** friendly display name for the created recurring item */
  name: string;
  type: "subscription" | "bill" | "debt" | "income";
  /** nodig (needs) for utilities/insurance, willen (wants) for entertainment subs */
  budgetType?: "nodig" | "willen";
}

export const RECURRING_MERCHANTS: RecurringMerchant[] = [
  // ── Streaming / entertainment subscriptions ──────────────────────────────
  { pattern: "netflix", name: "Netflix", type: "subscription", budgetType: "willen" },
  { pattern: "amazon prime", name: "Amazon Prime", type: "subscription", budgetType: "willen" },
  { pattern: "prime video", name: "Amazon Prime", type: "subscription", budgetType: "willen" },
  { pattern: "videoland", name: "Videoland", type: "subscription", budgetType: "willen" },
  { pattern: "spotify", name: "Spotify", type: "subscription", budgetType: "willen" },
  { pattern: "disney", name: "Disney+", type: "subscription", budgetType: "willen" },
  { pattern: "hbo max", name: "HBO Max", type: "subscription", budgetType: "willen" },
  { pattern: "youtube premium", name: "YouTube Premium", type: "subscription", budgetType: "willen" },
  { pattern: "apple.com/bill", name: "Apple", type: "subscription", budgetType: "willen" },
  { pattern: "icloud", name: "Apple iCloud", type: "subscription", budgetType: "willen" },
  { pattern: "google storage", name: "Google One", type: "subscription", budgetType: "willen" },
  { pattern: "audible", name: "Audible", type: "subscription", budgetType: "willen" },
  { pattern: "storytel", name: "Storytel", type: "subscription", budgetType: "willen" },

  // ── Telecom / internet ───────────────────────────────────────────────────
  { pattern: "vodafone", name: "Vodafone", type: "bill", budgetType: "nodig" },
  { pattern: "ziggo", name: "Ziggo", type: "bill", budgetType: "nodig" },
  { pattern: "kpn", name: "KPN", type: "bill", budgetType: "nodig" },
  { pattern: "t-mobile", name: "Odido", type: "bill", budgetType: "nodig" },
  { pattern: "odido", name: "Odido", type: "bill", budgetType: "nodig" },
  { pattern: "tele2", name: "Tele2", type: "bill", budgetType: "nodig" },
  { pattern: "simyo", name: "Simyo", type: "bill", budgetType: "nodig" },

  // ── Energy ───────────────────────────────────────────────────────────────
  { pattern: "eneco", name: "Eneco", type: "bill", budgetType: "nodig" },
  { pattern: "vattenfall", name: "Vattenfall", type: "bill", budgetType: "nodig" },
  { pattern: "essent", name: "Essent", type: "bill", budgetType: "nodig" },
  { pattern: "greenchoice", name: "Greenchoice", type: "bill", budgetType: "nodig" },
  { pattern: "budget energie", name: "Budget Energie", type: "bill", budgetType: "nodig" },

  // ── Water ────────────────────────────────────────────────────────────────
  { pattern: "vitens", name: "Vitens", type: "bill", budgetType: "nodig" },
  { pattern: "pwn", name: "PWN", type: "bill", budgetType: "nodig" },
  { pattern: "evides", name: "Evides", type: "bill", budgetType: "nodig" },
  { pattern: "brabant water", name: "Brabant Water", type: "bill", budgetType: "nodig" },
  { pattern: "waternet", name: "Waternet", type: "bill", budgetType: "nodig" },
  { pattern: "dunea", name: "Dunea", type: "bill", budgetType: "nodig" },

  // ── Insurance ────────────────────────────────────────────────────────────
  { pattern: "allianz", name: "Allianz", type: "bill", budgetType: "nodig" },
  { pattern: "centraal beheer", name: "Centraal Beheer", type: "bill", budgetType: "nodig" },
  { pattern: "aegon", name: "Aegon", type: "bill", budgetType: "nodig" },
  { pattern: "nationale-nederlanden", name: "Nationale-Nederlanden", type: "bill", budgetType: "nodig" },
  { pattern: "fbto", name: "FBTO", type: "bill", budgetType: "nodig" },
  { pattern: "zilveren kruis", name: "Zilveren Kruis", type: "bill", budgetType: "nodig" },
  { pattern: "cz ", name: "CZ", type: "bill", budgetType: "nodig" },
  { pattern: "vgz", name: "VGZ", type: "bill", budgetType: "nodig" },
  { pattern: "menzis", name: "Menzis", type: "bill", budgetType: "nodig" },
  { pattern: "ohra", name: "OHRA", type: "bill", budgetType: "nodig" },
  { pattern: "univé", name: "Univé", type: "bill", budgetType: "nodig" },

  // ── Fitness / other recurring services ───────────────────────────────────
  { pattern: "basic-fit", name: "Basic-Fit", type: "subscription", budgetType: "willen" },
  { pattern: "sportcity", name: "SportCity", type: "subscription", budgetType: "willen" },
];

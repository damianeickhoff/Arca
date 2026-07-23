// Default description-pattern -> brand icon mappings, applied to every
// transaction alongside any custom rules created in the brand icons settings
// page. Unlike custom rules (stored in the brand_icon_rules table), these
// never appear in the settings page and can't be edited or deleted there —
// only rules created through the UI are listed and editable.
export interface DefaultBrandIconRule {
  namePattern: string;
  matchType: "contains" | "word" | "exact";
  brandIcon: string;
  iconColor?: string | null;
  iconBgColor?: string | null;
}

export const DEFAULT_BRAND_ICONS: DefaultBrandIconRule[] = [
  { namePattern: "albert heijn", matchType: "contains", brandIcon: "paypal" },
  { namePattern: "lidl", matchType: "contains", brandIcon: "lidl" },
  { namePattern: "ikea", matchType: "contains", brandIcon: "ikea" },
  { namePattern: "zalando", matchType: "contains", brandIcon: "zalando" },
  { namePattern: "spotify", matchType: "contains", brandIcon: "spotify" },
  { namePattern: "netflix", matchType: "contains", brandIcon: "netflix" },
  { namePattern: "paypal", matchType: "contains", brandIcon: "paypal" },
  { namePattern: "uber eats", matchType: "contains", brandIcon: "uber-eats" },
  { namePattern: "mcdonalds", matchType: "contains", brandIcon: "mcdonalds", iconBgColor: "#db1515" },
  { namePattern: "starbucks", matchType: "contains", brandIcon: "starbucks" },
  { namePattern: "airbnb", matchType: "contains", brandIcon: "airbnb" },
  { namePattern: "steam", matchType: "word", brandIcon: "steam" },
  { namePattern: "github", matchType: "contains", brandIcon: "github" },
  { namePattern: "vodafone", matchType: "contains", brandIcon: "vodafone" },
  { namePattern: "Amazon EU SARL", matchType: "contains", brandIcon: "amazon-prime" },
  { namePattern: "Stripe", matchType: "contains", brandIcon: "stripe" },
  { namePattern: "apple", matchType: "contains", brandIcon: "apple", iconBgColor: "#000000" },
];

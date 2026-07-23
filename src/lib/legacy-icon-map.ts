/**
 * Maps the old Lucide icon keys (stored as bare PascalCase names, e.g. "Car", or "filled:Pizza")
 * to their Tabler equivalents, so categories/recurring items/savings goals created before the
 * Lucide → Tabler switch keep rendering correctly without a data migration.
 */
export const LEGACY_LUCIDE_TO_TABLER: Record<string, string> = {
  Briefcase: "IconBriefcase",
  TrendingUp: "IconTrendingUp",
  Banknote: "IconCash",
  Wallet: "IconWallet",
  PiggyBank: "IconPigMoney",
  Home: "IconHome",
  Zap: "IconBolt",
  Wifi: "IconWifi",
  Phone: "IconPhone",
  Shield: "IconShield",
  ShoppingCart: "IconShoppingCart",
  UtensilsCrossed: "IconToolsKitchen2",
  Coffee: "IconCoffee",
  Pizza: "IconPizza",
  Car: "IconCar",
  Fuel: "IconGasStation",
  Train: "IconTrain",
  Bike: "IconBike",
  Music: "IconMusic",
  Tv: "IconDeviceTv",
  Gamepad2: "IconDeviceGamepad2",
  Film: "IconMovie",
  Book: "IconBook",
  Headphones: "IconHeadphones",
  FerrisWheel: "IconTicket",
  Heart: "IconHeart",
  Dumbbell: "IconBarbell",
  Stethoscope: "IconStethoscope",
  Pill: "IconPill",
  ShoppingBag: "IconShoppingBag",
  Shirt: "IconShirt",
  Watch: "IconDeviceWatch",
  Baby: "IconBabyCarriage",
  GraduationCap: "IconSchool",
  Users: "IconUsers",
  Plane: "IconPlane",
  MapPin: "IconMapPin",
  Luggage: "IconLuggage",
  TreePalm: "IconBeach",
  Umbrella: "IconUmbrella",
  Target: "IconTarget",
  BarChart3: "IconChartBar",
  Building2: "IconBuildingEstate",
  Landmark: "IconBuildingBank",
  CreditCard: "IconCreditCard",
  Receipt: "IconReceipt",
  Star: "IconStar",
  Tag: "IconTag",
  Package: "IconPackage",
  Wrench: "IconTool",
  Sparkles: "IconSparkles",
};

/** Resolves a possibly-legacy icon key ("Car", "filled:Pizza") to a Tabler component key ("IconCar", "IconPizzaFilled"). */
export function resolveLegacyIconKey(key: string, tablerKeys: Set<string>): string | null {
  const isFilled = key.startsWith("filled:");
  const base = isFilled ? key.slice(7) : key;
  const tablerBase = LEGACY_LUCIDE_TO_TABLER[base];
  if (!tablerBase) return null;
  if (isFilled && tablerKeys.has(`${tablerBase}Filled`)) return `${tablerBase}Filled`;
  return tablerBase;
}

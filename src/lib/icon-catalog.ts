// What the icon picker offers: the Tabler glyphs (labels in messages at
// iconPicker.icons.<key>), the keywords that make them findable and suggestable in
// both languages, the pastel colour row and the "Auto" colour. React-free, so the
// suggestion logic can be unit tested.
import { BRAND_MAP } from "@/lib/brand-map";
import { brandColorForIconKey, detectBrandIcon } from "@/lib/brand-detect";

/** Tabler glyphs in the picker, each with search keywords (English and Dutch).
 *  The key is the Tabler component name; the label lives in the translation file. */
export const PICKER_ICONS: readonly { key: string; keywords: string }[] = [
  // Money and work
  { key: "IconBriefcase", keywords: "work job salary werk baan salaris loon" },
  { key: "IconBriefcase2", keywords: "services freelance diensten zzp" },
  { key: "IconCash", keywords: "money cash geld contant" },
  { key: "IconCashBanknote", keywords: "banknote cash atm contant pinautomaat" },
  { key: "IconCoins", keywords: "coins money change munten geld" },
  { key: "IconWallet", keywords: "wallet money portemonnee geld" },
  { key: "IconPig", keywords: "savings piggy bank sparen spaarpot spaarvarken" },
  { key: "IconTrendingUp", keywords: "growth income rise groei stijging" },
  { key: "IconSwitchHorizontal", keywords: "transfer swap overboeking overschrijving" },
  { key: "IconArrowBackUp", keywords: "refund return terugbetaling retour" },
  { key: "IconCreditCardRefund", keywords: "cashback refund terugstorting" },
  { key: "IconChartHistogram", keywords: "investments stocks beleggingen aandelen" },
  { key: "IconChartBar", keywords: "investing stocks chart beleggen grafiek" },
  { key: "IconChartAreaLine", keywords: "chart trend graph grafiek" },
  { key: "IconReportMoney", keywords: "report tax belasting rapport" },
  { key: "IconReceiptEuro", keywords: "bill invoice receipt rekening factuur bon" },
  { key: "IconReceipt", keywords: "debt bill receipt schuld rekening bon" },
  { key: "IconCreditCard", keywords: "credit card debt creditcard schuld" },
  { key: "IconBuildingBank", keywords: "bank loan mortgage lening hypotheek" },
  { key: "IconPercentage", keywords: "interest rate rente procent" },
  // Housing and bills
  { key: "IconHome", keywords: "home rent housing mortgage wonen huur hypotheek huis" },
  { key: "IconHomeDollar", keywords: "rent mortgage housing huur hypotheek" },
  { key: "IconHomeBolt", keywords: "utilities energy nuts energie" },
  { key: "IconHomeShield", keywords: "home insurance opstal inboedel verzekering" },
  { key: "IconBuildingEstate", keywords: "house buy property huis kopen woning" },
  { key: "IconBuildingSkyscraper", keywords: "city office apartment stad kantoor" },
  { key: "IconBolt", keywords: "energy electricity power gas energie stroom elektriciteit" },
  { key: "IconBulb", keywords: "electricity light idea stroom licht" },
  { key: "IconWifi", keywords: "internet wifi telecom" },
  { key: "IconPhone", keywords: "phone mobile telecom telefoon mobiel" },
  { key: "IconDeviceMobile", keywords: "mobile phone smartphone telefoon mobiel" },
  { key: "IconShield", keywords: "insurance protection verzekering" },
  { key: "IconShieldHeart", keywords: "health insurance zorgverzekering" },
  { key: "IconShieldLock", keywords: "security privacy beveiliging" },
  { key: "IconUmbrella", keywords: "insurance rain paraplu verzekering" },
  { key: "IconFridge", keywords: "appliance kitchen koelkast keuken" },
  { key: "IconLamp", keywords: "furniture interior meubels interieur lamp" },
  { key: "IconTool", keywords: "maintenance repair diy onderhoud reparatie klussen" },
  // Food
  { key: "IconShoppingCart", keywords: "groceries supermarket food boodschappen supermarkt eten" },
  { key: "IconBuildingStore", keywords: "shop store winkel" },
  { key: "IconToolsKitchen2", keywords: "restaurant eating out dinner food uit eten" },
  { key: "IconCoffee", keywords: "coffee cafe koffie" },
  { key: "IconCup", keywords: "drinks tea thee drinken" },
  { key: "IconPizza", keywords: "takeaway food delivery bezorgen afhaal eten" },
  { key: "IconBowlChopsticks", keywords: "asian sushi food eten" },
  { key: "IconGlassCocktail", keywords: "drinks bar cocktail going out uitgaan" },
  // Transport
  { key: "IconCar", keywords: "car transport auto vervoer" },
  { key: "IconGasStation", keywords: "fuel petrol gas car tanken benzine brandstof" },
  { key: "IconEngine", keywords: "car repair garage auto onderhoud" },
  { key: "IconParkingCircle", keywords: "parking parkeren" },
  { key: "IconRoad", keywords: "toll road travel tol weg" },
  { key: "IconTrain", keywords: "train public transport ov trein openbaar vervoer" },
  { key: "IconBike", keywords: "bike bicycle fiets" },
  { key: "IconBrandUber", keywords: "taxi uber ride rit" },
  // Entertainment
  { key: "IconMusic", keywords: "music spotify muziek" },
  { key: "IconHeadphones", keywords: "audio podcast music muziek" },
  { key: "IconDeviceTv", keywords: "streaming tv netflix televisie" },
  { key: "IconMovie", keywords: "cinema film movie bioscoop" },
  { key: "IconDeviceGamepad2", keywords: "games gaming spellen" },
  { key: "IconBook", keywords: "books reading boeken lezen" },
  { key: "IconTicket", keywords: "tickets events concert kaartjes evenementen" },
  { key: "IconRollercoaster", keywords: "theme park day out pretpark uitje" },
  { key: "IconBallBowling", keywords: "bowling sport leisure vrije tijd" },
  { key: "IconBallFootball", keywords: "football soccer sport club voetbal vereniging" },
  { key: "IconApps", keywords: "apps software subscriptions abonnementen" },
  { key: "IconDeviceLaptop", keywords: "laptop computer tech electronics elektronica" },
  // Health and care
  { key: "IconHeart", keywords: "health care love gezondheid zorg" },
  { key: "IconActivityHeartbeat", keywords: "health fitness heartbeat gezondheid" },
  { key: "IconBarbell", keywords: "gym fitness sport sportschool" },
  { key: "IconStethoscope", keywords: "doctor health huisarts dokter gezondheid" },
  { key: "IconPill", keywords: "medicine pharmacy medicijnen apotheek" },
  { key: "IconDental", keywords: "dentist teeth tandarts" },
  { key: "IconEyeglass", keywords: "glasses optician lenses eyes bril opticien lenzen ogen" },
  { key: "IconMassage", keywords: "massage wellness spa" },
  { key: "IconFaceMask", keywords: "beauty skincare mask schoonheid" },
  { key: "IconPerfume", keywords: "perfume beauty drugstore parfum drogist" },
  // Shopping
  { key: "IconShoppingBag", keywords: "shopping bag winkelen" },
  { key: "IconShirt", keywords: "clothing fashion clothes kleding mode" },
  { key: "IconDeviceWatch", keywords: "accessories watch accessoires horloge" },
  { key: "IconGift", keywords: "gifts presents birthday cadeau verjaardag" },
  { key: "IconPackage", keywords: "parcel delivery online pakket bezorging" },
  // Family
  { key: "IconBabyCarriage", keywords: "baby kids children kinderen" },
  { key: "IconSchool", keywords: "education school study opleiding studie" },
  { key: "IconUsers", keywords: "family friends people familie vrienden" },
  { key: "IconPaw", keywords: "pets animals huisdieren dieren" },
  { key: "IconDog", keywords: "dog pets hond huisdier" },
  { key: "IconGrave2", keywords: "funeral insurance uitvaart begrafenis" },
  // Travel
  { key: "IconPlane", keywords: "flights travel plane vliegen reizen vliegtuig" },
  { key: "IconPlaneDeparture", keywords: "flights holiday travel vakantie vliegen" },
  { key: "IconMapPin", keywords: "travel place trip reizen plaats" },
  { key: "IconMap2", keywords: "travel map trip reizen kaart" },
  { key: "IconMapShield", keywords: "travel insurance reisverzekering" },
  { key: "IconLuggage", keywords: "luggage travel bagage reizen" },
  { key: "IconBeach", keywords: "holiday vacation beach vakantie strand" },
  { key: "IconCamper", keywords: "camper camping caravan" },
  { key: "IconSailboat", keywords: "boat sailing boot zeilen" },
  // Goals and other
  { key: "IconTarget", keywords: "goal target savings doel sparen" },
  { key: "IconStar", keywords: "favourite star favoriet ster" },
  { key: "IconTag", keywords: "label tag other overig" },
  { key: "IconSparkles", keywords: "other misc various overig diversen" },
];

const ICON_KEYS = new Set(PICKER_ICONS.map((i) => i.key));

/** The curated keywords by key, added to the full Tabler search index so the Dutch
 *  words (and the extra English ones) find those icons there too. */
export const PICKER_ICON_KEYWORDS: Record<string, string> = Object.fromEntries(PICKER_ICONS.map((i) => [i.key, i.keywords]));

/** The colour row's named swatches, as the hex stored on the category, merchant or
 *  goal. Icons render "soft" (16% fill, glyph in a deeper shade), so each hex is the
 *  saturated colour whose soft tile lands on the matching Clear pastel. */
export const PICKER_COLOURS = {
  peach: "#F0855F",
  butter: "#F2B200",
  mint: "#2FB565",
  sky: "#4A7CF3",
  lilac: "#8A5CE6",
  rose: "#E5508F",
  stone: "#8A8A96",
  black: "#111113",
  ember: "#FF5B2E",
} as const;

export type PickerColourName = keyof typeof PICKER_COLOURS;
export const PICKER_COLOUR_NAMES = Object.keys(PICKER_COLOURS) as PickerColourName[];

/** The pastels "Auto" picks from for a glyph (stone, black and ember are choices, not defaults). */
const AUTO_PASTELS: PickerColourName[] = ["peach", "butter", "mint", "sky", "lilac", "rose"];

/** A stable pastel for a name, so a glyph on "Auto" always gets the same colour. */
export function autoPastelFor(name: string): string {
  let hash = 0;
  for (const ch of name.trim().toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return PICKER_COLOURS[AUTO_PASTELS[Math.abs(hash) % AUTO_PASTELS.length]];
}

/** The colour "Auto" stands for: the brand's own colour for a logo, else the name's pastel. */
export function autoColourFor(icon: string | null, name: string): string {
  return brandColorForIconKey(icon) ?? autoPastelFor(name);
}

/** Which swatch a stored colour matches, if any. */
export function colourNameOf(hex: string | null | undefined): PickerColourName | null {
  if (!hex) return null;
  const lower = hex.toLowerCase();
  return PICKER_COLOUR_NAMES.find((n) => PICKER_COLOURS[n].toLowerCase() === lower) ?? null;
}

/** Brand logos in the picker, alphabetically by their own title. */
export function pickerBrands(): { key: string; label: string }[] {
  return Object.entries(BRAND_MAP)
    .map(([key, entry]) => ({ key, label: entry.title ?? key }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Lowercase words of a name, without punctuation. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length >= 3);
}

/** True when a search query matches a key, a label or keywords (case-insensitive). */
export function matchesQuery(query: string, ...haystacks: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystacks.some((h) => !!h && h.toLowerCase().includes(q));
}

/**
 * Icons that fit a name: every glyph whose keywords or label share a word with it
 * ("Gym" → barbell, heartbeat). `labelOf` gives the translated label. Up to `limit`.
 */
export function suggestIcons(name: string, labelOf: (key: string) => string, limit = 8): string[] {
  const nameWords = words(name);
  if (nameWords.length === 0) return [];
  const hit = (text: string) => {
    const ws = words(text);
    return nameWords.some((n) => ws.some((w) => w.startsWith(n) || n.startsWith(w)));
  };
  return PICKER_ICONS.filter((i) => hit(`${i.keywords} ${labelOf(i.key)}`))
    .map((i) => i.key)
    .slice(0, limit);
}

/** Brand logos that fit a name: the detected brand first, then brands whose title shares a word. */
export function suggestBrands(name: string, limit = 6): string[] {
  const out: string[] = [];
  const detected = detectBrandIcon(name);
  if (detected) out.push(detected.iconKey);
  const nameWords = words(name);
  for (const b of pickerBrands()) {
    if (out.length >= limit) break;
    if (out.includes(b.key)) continue;
    const bw = words(b.label);
    if (nameWords.some((n) => bw.includes(n))) out.push(b.key);
  }
  return out;
}

/** True for a Tabler glyph the picker lists (Filled variants count as their line icon). */
export function isPickerGlyph(key: string | null | undefined): boolean {
  if (!key) return false;
  return ICON_KEYS.has(key.replace(/Filled$/, ""));
}

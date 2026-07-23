// Default categories seeded from this file. On the first run that sees a given entry
// (matched by its stable `key`), it is inserted into the database (see
// src/lib/config-sync.ts, run synchronously from src/db/index.ts). After that the
// category is user-owned: it can be freely edited or deleted from the UI, and those
// changes are never overwritten by this file. Adding a new entry here still seeds it
// on the next boot; editing or removing an already-seeded entry here does NOT push
// the change to (or remove) the existing category.
//
// `key` is the stable identity of an entry — never change it once set, or the sync
// will treat the entry as deleted + newly added. Everything else (including `name`)
// can be edited freely.
//
// `matchingPatterns` auto-categorizes transactions whose description matches any of
// the listed patterns (case-insensitive), the same way a user-created category rule
// would — list as many as you need. Each entry is either:
//   - a plain string  → "contains" match, either direction, e.g. "Monuta"
//   - an object        → { pattern, match?, direction? } for finer control:
//       match:     "contains" (default) | "word" (whole word) | "exact"
//       direction: omit for both, or "income" | "expense" to restrict by sign
//   e.g. { pattern: "ALBERT HEIJN", match: "word", direction: "expense" }
// These patterns are seeded as category rules when the category is first created
// (see the seed-once model in src/lib/config-sync.ts); afterwards they're editable
// from the UI like any other rule.
//
// `icon` accepts any icon name from @tabler/icons-react as a string — no import
// needed, e.g. "IconBriefcase" or the solid variant "IconBriefcaseFilled".
// Browse names at https://tabler.io/icons (PascalCase with "Icon" prefix).
//
// `parentKey` makes this entry a sub-category of the entry whose `key` it names —
// any entry can be a parent, it doesn't need to be declared specially. Nesting is
// capped at 2 levels: a `parentKey` that points at an entry which itself has a
// `parentKey` is ignored by the sync (logged, not applied).
export type MatchType = "contains" | "word" | "exact";
export type MatchDirection = "income" | "expense";

/** A matching rule: a bare string (contains / any direction) or an object for finer control. */
export type MatchingPattern =
  | string
  | { pattern: string; match?: MatchType; direction?: MatchDirection };

export interface NormalizedPattern {
  pattern: string;
  match: MatchType;
  direction: MatchDirection | null;
}

/** Expands a MatchingPattern to its explicit form, applying defaults (contains / both directions). */
export function normalizeMatchingPattern(entry: MatchingPattern): NormalizedPattern {
  if (typeof entry === "string") return { pattern: entry, match: "contains", direction: null };
  return { pattern: entry.pattern, match: entry.match ?? "contains", direction: entry.direction ?? null };
}

export interface DefaultCategory {
  key: string;
  name: string;
  budgetType: string | null;
  color: string | null;
  icon: string | null;
  matchingPatterns?: MatchingPattern[];
  parentKey?: string;
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [

  { 
  key: "Education", 
  name: "Education", 
  budgetType: "Needs", 
  color: "#de3535", 
  icon: "IconSchoolFilled",
  matchingPatterns: [
    "DUO",
    "Studielink",
    "CITO",
    "CIBT",
    "LOI",
    "NCOI",
    "NTI",
    "Open Universiteit",
    "Hogeschool",
    "Universiteit",
    "ROC",
    "MBO",
    "Fontys",
    "Hanze",
    "Avans",
    "Inholland",
    "Saxion",
    "Windesheim",
    "Leiden University",
    "TU Delft",
    "Erasmus Universiteit",
    "Universiteit Utrecht",
    "Radboud",
    "Maastricht University"
  ]
},

// Entertainment
{ 
  key: "Entertainment",
  name: "Entertainment",
  budgetType: "Wants",
  color: "#de3535",
  icon: "IconDeviceTvFilled"
},

{
  key: "Events",
  name: "Events",
  budgetType: "Wants",
  color: "#de3535",
  icon: "IconTicketFilled",
  parentKey: "Entertainment",
  matchingPatterns: [
    "Eventbrite",
    "Pathe",
    "Pathé",
    "Efteling",
    "Walibi",
    "Toverland",
    "Duinrell",
    "Madurodam",
    "Beekse Bergen",
    "Avonturenpark Hellendoorn",
    "Ticketmaster",
    "TicketSwap"
  ]
},

{ 
  key: "Hobbies",
  name: "Hobbies",
  budgetType: "Wants",
  color: "#de3535",
  icon: "IconBallBowlingFilled",
  parentKey: "Entertainment",
  matchingPatterns: [
    "Hobby",
    "Hobbyshop",
    "Intertoys",
    "Spellenwinkel",
    "Boardgame",
    "Bordspel",
    "Modelbouw"
  ]
},

{
  key: "Cinema",
  name: "Cinema",
  budgetType: "Wants",
  color: "#de3535",
  icon: "IconMovieFilled",
  parentKey: "Entertainment",
  matchingPatterns: [
    "Pathé",
    "Pathe",
    "Vue Cinema",
    "Kinepolis"
  ]
},

{
  key: "Sports & Recreation",
  name: "Sports & Recreation",
  budgetType: "Wants",
  color: "#de3535",
  icon: "IconTrophyFilled",
  parentKey: "Entertainment",
  matchingPatterns: [
    "Bowling",
    "GlowGolf",
    "Escape Room",
    "Karting"
  ]
},

// Subscriptions
{ key: "Subscriptions", name: "Subscriptions", budgetType: "Wants", color: "#6e88eb", icon: "IconHeadphonesFilled" },
{ 
  key: "Streaming Services",
  name: "Streaming Services",
  budgetType: "Wants",
  color: "#6e88eb",
  icon: "IconVideoFilled",
  parentKey: "Subscriptions",
  matchingPatterns: [
    "Netflix",
    "Disney",
    "Disney+",
    "HBO",
    "Max",
    "Videoland",
    "Viaplay",
    "Spotify",
    "Apple Music",
    "Amazon Prime",
    "Prime Video",
    "NLZIET"
  ]
},

{ 
  key: "Gaming",
  name: "Gaming",
  budgetType: "Wants",
  color: "#6e88eb",
  icon: "IconDeviceGamepad2Filled",
  parentKey: "Subscriptions",
  matchingPatterns: [
    "Steam",
    "Valve",
    "PlayStation",
    "Sony Interactive",
    "Xbox",
    "Nintendo",
    "Epic Games",
    "Battle.net"
  ]
},

{ 
  key: "Apps & Software",
  name: "Apps & Software",
  budgetType: "Wants",
  color: "#6e88eb",
  icon: "IconAppsFilled",
  parentKey: "Subscriptions",
  matchingPatterns: [
    "App Store",
    "APPLE.COM/BILL",
    "Google Play",
    "Google*",
    "OpenAI",
    "ChatGPT",
    "Suno",
    "Adobe",
    "Microsoft 365",
    "Dropbox"
  ]
},
// Shopping
{ 
  key: "Shopping",
  name: "Shopping",
  budgetType: "Wants",
  color: "#9c8bf4",
  icon: "IconBasketFilled"
},

{ 
  key: "Clothing",
  name: "Clothing",
  budgetType: "Wants",
  color: "#9c8bf4",
  icon: "IconShirtFilled",
  parentKey: "Shopping",
  matchingPatterns: [
    "Zalando",
    "About You",
    "H&M",
    "C&A",
    "WE Fashion",
    "Vero Moda",
    "Only",
    "JBC",
    "Bershka",
    "Pull&Bear",
    "Primark",
    "Zara",
    "Foot Locker"
  ]
},

{ 
  key: "Electronics",
  name: "Electronics",
  budgetType: "Wants",
  color: "#9c8bf4",
  icon: "IconDeviceDesktopFilled",
  parentKey: "Shopping",
  matchingPatterns: [
    "Coolblue",
    "MediaMarkt",
    "Alternate",
    "Azerty",
    "Megekko",
    "Amac",
    "BCC"
  ]
},

{ 
  key: "Home Goods",
  name: "Home Goods",
  budgetType: "Wants",
  color: "#9c8bf4",
  icon: "IconBedFilled",
  parentKey: "Shopping",
  matchingPatterns: [
    "IKEA",
    "Action",
    "HEMA",
    "Xenos",
    "Blokker",
    "Leen Bakker",
    "Kwantum",
    "Jysk",
    "Praxis",
    "Gamma",
    "Karwei",
    "Hornbach"
  ]
},

{ 
  key: "General Shopping",
  name: "General Shopping",
  budgetType: "Wants",
  color: "#9c8bf4",
  icon: "IconShoppingBagFilled",
  parentKey: "Shopping",
  matchingPatterns: [
    "Bol.com",
    "Amazon",
    "AliExpress",
    "Temu",
    "Wehkamp",
    "Vinted",
    "Marktplaats"
  ]
},
  // Family
  { 
  key: "Family", 
  name: "Family", 
  budgetType: "Needs", 
  color: "#deb435", 
  icon: "IconHomeFilled",
  matchingPatterns: [
    "Kinderopvang",
    "KDV",
    "BSO",
    "Buitenschoolse opvang",
    "Gastouder",
    "Peuteropvang",
    "Consultatiebureau",
    "Jeugdzorg",
    "Kinderbijslag",
    "Schoolreis",
    "Ouderbijdrage"
  ]
},

// Finance
{ key: "Finance", name: "Finance", budgetType: "Wants", color: "#15c556", icon: "IconCashBanknoteFilled" },

{ 
  key: "Bank Fees", 
  name: "Bank Fees", 
  budgetType: "Wants", 
  color: "#15c556", 
  icon: "IconPigFilled", 
  parentKey: "Finance",
  matchingPatterns: [
    "ING Bank",
    "ABN AMRO",
    "Rabobank",
    "Bunq",
    "Revolut",
    "Bankkosten",
    "Kosten rekening",
    "Servicekosten",
    "Maandbijdrage"
  ]
},

{ 
  key: "Investments", 
  name: "Investments", 
  budgetType: "Wants", 
  color: "#15c556", 
  icon: "IconChartAreaLineFilled", 
  parentKey: "Finance",
  matchingPatterns: [
    "DEGIRO",
    "Trade Republic",
    "Trading 212",
    "eToro",
    "Interactive Brokers",
    "Bux",
    "Meesman",
    "Brand New Day",
    "Bitvavo",
    "Coinbase",
    "Crypto.com"
  ]
},

{ 
  key: "Pocket money", 
  name: "Pocket money", 
  budgetType: "Wants", 
  color: "#15c556", 
  icon: "IconCashBanknoteFilled", 
  parentKey: "Finance",
  matchingPatterns: [
    "Zakgeld",
    "Pocket money"
  ]
},

{ 
  key: "Savings", 
  name: "Savings", 
  budgetType: "Wants", 
  color: "#15c556", 
  icon: "IconPigFilled", 
  parentKey: "Finance",
  matchingPatterns: [
    "Spaarrekening",
    "Sparen",
    "Savings",
    "Overboeking spaarrekening"
  ]
},

{ 
  key: "Taxes", 
  name: "Taxes", 
  budgetType: "Wants", 
  color: "#15c556", 
  icon: "IconReceiptEuroFilled", 
  parentKey: "Finance",
  matchingPatterns: [
    "Belastingdienst",
    "Gemeentelijke belasting",
    "Waterschapsbelasting",
    "Rijksbelasting",
    "Inkomstenbelasting",
    "BTW"
  ]
},

// Food & Dining
{ key: "Food & Dining", name: "Food & Dining", budgetType: "Needs", color: "#ef5b3f", icon: "IconToolsKitchen2Filled" },
{ 
  key: "Groceries",
  name: "Groceries",
  budgetType: "Needs",
  color: "#ef5b3f",
  icon: "IconShoppingCartFilled",
  parentKey: "Food & Dining",
  matchingPatterns: [
    "Albert Heijn",
    "AH TO GO",
    "AHOLD",
    "Jumbo",
    "PLUS",
    "Coop",
    "Dirk",
    "DekaMarkt",
    "Lidl",
    "Aldi",
    "Spar",
    "Ekoplaza",
    "Picnic",
    "Crisp",
    "Boni"
  ]
},

{
  key: "Food Delivery",
  name: "Food Delivery",
  budgetType: "Wants",
  color: "#ef5b3f",
  icon: "IconBowlChopsticksFilled",
  parentKey: "Food & Dining",
  matchingPatterns: [
    "Thuisbezorgd",
    "Takeaway",
    "Uber Eats",
    "Deliveroo",
    "Domino",
    "New York Pizza"
  ]
},

{
  key: "Restaurants & Bars",
  name: "Restaurants & Bars",
  budgetType: "Wants",
  color: "#ef5b3f",
  icon: "IconBeerFilled",
  parentKey: "Food & Dining",
  matchingPatterns: [
    "Restaurant",
    "Cafe",
    "Café",
    "Bistro",
    "Eetcafe",
    "McDonalds",
    "Burger King",
    "KFC",
    "Subway"
  ]
},
{ 
  key: "Gifts", 
  name: "Gifts", 
  budgetType: "Wants", 
  color: "#4ade35", 
  icon: "IconGiftFilled",
  matchingPatterns: [
    "Greetz",
    "Hallmark",
    "Bloomon",
    "Bol.com",
    "Cadeau",
    "Cadeaubon",
    "Giftcard",
    "Gift Card",
    "YourSurprise",
    "Fleurop",
    "Topbloemen"
  ]
},
// Health
{ key: "Health", name: "Health", budgetType: "Needs", color: "#90d731", icon: "IconDeviceHeartMonitorFilled" },

{ 
  key: "Doctor Visits", 
  name: "Doctor Visits", 
  budgetType: "Needs", 
  color: "#90d731", 
  icon: "IconFaceMaskFilled", 
  parentKey: "Health",
  matchingPatterns: [
    "Huisarts",
    "Apotheek",
    "Ziekenhuis",
    "UMC",
    "Mediq",
    "Zorggroep",
    "Polikliniek",
    "Specialist",
    "Fysiotherapie",
    "Fysiotherapeut"
  ]
},

{ 
  key: "Health Insurance", 
  name: "Health Insurance", 
  budgetType: "Needs", 
  color: "#90d731", 
  icon: "IconShieldCheckFilled", 
  parentKey: "Health",
  matchingPatterns: [
    "Zilveren Kruis",
    "CZ",
    "VGZ",
    "Menzis",
    "DSW",
    "ONVZ",
    "Ditzo",
    "De Friesland",
    "Interpolis",
    "Aevitae"
  ]
},

{ 
  key: "Medication", 
  name: "Medication", 
  budgetType: "Needs", 
  color: "#90d731", 
  icon: "IconPillFilled", 
  parentKey: "Health",
  matchingPatterns: [
    "Apotheek",
    "Mediq",
    "Pharmacie",
    "Medicijn",
    "Recept"
  ]
},

{ 
  key: "Dental Care", 
  name: "Dental Care", 
  budgetType: "Needs", 
  color: "#90d731", 
  icon: "IconMedicalCrossFilled", 
  parentKey: "Health",
  matchingPatterns: [
    "Tandarts",
    "Tandheelkunde",
    "Dental",
    "Mondzorg",
    "Orthodont"
  ]
},

{ 
  key: "Sport", 
  name: "Sport", 
  budgetType: "Wants", 
  color: "#90d731", 
  icon: "IconBarbellFilled", 
  parentKey: "Health",
  matchingPatterns: [
    "Basic-Fit",
    "SportCity",
    "TrainMore",
    "David Lloyd",
    "OneFit",
    "ClassPass",
    "CrossFit",
    "Zwembad",
    "Fitness"
  ]
},

{ 
  key: "Life Insurance", 
  name: "Life Insurance", 
  budgetType: "Wants", 
  color: "#90d731", 
  icon: "IconUmbrellaFilled", 
  parentKey: "Health",
  matchingPatterns: [
    "Levensverzekering",
    "Nationale Nederlanden",
    "NN",
    "Aegon",
    "ASR",
    "Allianz",
    "Achmea"
  ]
},
// Housing
{ key: "Housing", name: "Housing", budgetType: "Needs", color: "#489bd8", icon: "IconHome2Filled"},
{
  key: "Utilities",
  name: "Utilities",
  budgetType: "Needs",
  color: "#489bd8",
  icon: "IconBoltFilled",
  parentKey: "Housing",
  matchingPatterns: [
    "Vattenfall",
    "Eneco",
    "Essent",
    "Greenchoice",
    "Oxxio",
    "Budget Energie",
    "Vitens",
    "Waternet",
    "PWN"
  ]
},

{
  key: "Internet",
  name: "Internet",
  budgetType: "Needs",
  color: "#489bd8",
  icon: "IconCloudFilled",
  parentKey: "Housing",
  matchingPatterns: [
    "KPN",
    "Ziggo",
    "Odido",
    "T-Mobile",
    "Delta",
    "Caiway",
    "Youfone",
    "Freedom Internet"
  ]
},

{
  key: "Phone",
  name: "Phone",
  budgetType: "Needs",
  color: "#489bd8",
  icon: "IconDeviceMobileFilled",
  parentKey: "Housing",
  matchingPatterns: [
    "KPN Mobiel",
    "Vodafone",
    "Odido",
    "Ben",
    "Simyo",
    "Lebara",
    "Hollandsnieuwe"
  ]
},
// Income
{ key: "Income", name: "Income", budgetType: "Needs", color: "#15cf85", icon: "IconCoinFilled" },

{ 
  key: "Benefits", 
  name: "Benefits", 
  budgetType: "Wants", 
  color: "#15cf85", 
  icon: "IconSparklesFilled", 
  parentKey: "Income",
  matchingPatterns: [
    { pattern: "UWV", direction: "income" },
    { pattern: "SVB", direction: "income" },
    { pattern: "Kinderbijslag", direction: "income" },
    { pattern: "Toeslag", direction: "income" },
    { pattern: "Belastingdienst", direction: "income" },
    { pattern: "Huurtoeslag", direction: "income" },
    { pattern: "Zorgtoeslag", direction: "income" },
    { pattern: "Kinderopvangtoeslag", direction: "income" }
  ]
},

{ 
  key: "Other Income", 
  name: "Other Income", 
  budgetType: "Wants", 
  color: "#15cf85", 
  icon: "IconCashBanknoteFilled", 
  parentKey: "Income",
  matchingPatterns: [
    { pattern: "Marktplaats", direction: "income" },
    { pattern: "Vinted", direction: "income" },
    { pattern: "Verkoop", direction: "income" },
    { pattern: "Freelance", direction: "income" }
  ]
},

{ 
  key: "Refunds", 
  name: "Refunds", 
  budgetType: "Wants", 
  color: "#15cf85", 
  icon: "IconExchangeFilled", 
  parentKey: "Income",
  matchingPatterns: [
    { pattern: "Terugbetaling", direction: "income" },
    { pattern: "Restitutie", direction: "income" },
    { pattern: "Refund", direction: "income" },
    { pattern: "Retour", direction: "income" },
    { pattern: "Credit", direction: "income" }
  ]
},

{ 
  key: "Reimbursement", 
  name: "Reimbursement", 
  budgetType: "Wants", 
  color: "#15cf85", 
  icon: "IconReplaceFilled", 
  parentKey: "Income",
  matchingPatterns: [
    { pattern: "Tikkie", direction: "income" },
    { pattern: "Betaalverzoek", direction: "income" },
    { pattern: "Terugbetaling", direction: "income" },
    { pattern: "Vergoeding", direction: "income" },
    { pattern: "Declaratie", direction: "income" }
  ]
},

{ 
  key: "Salary", 
  name: "Salary", 
  budgetType: "Wants", 
  color: "#15cf85", 
  icon: "IconCreditCardFilled", 
  parentKey: "Income",
  matchingPatterns: [
    { pattern: "Salaris", direction: "income" },
    { pattern: "Loon", direction: "income" },
    { pattern: "Payroll", direction: "income" },
    { pattern: "Salary", direction: "income" },
    { pattern: "Wage", direction: "income" }
  ]
},

// Loans
{ 
  key: "Loans", 
  name: "Loans", 
  budgetType: "Needs", 
  color: "#359fde", 
  icon: "IconReportMoneyFilled",
  matchingPatterns: [
    "DUO",
    "Klarna",
    "Santander",
    "Freo",
    "Defam",
    "Lening",
    "Loan"
  ]
},

// Personal Care
{ key: "Personal Care", name: "Personal Care", budgetType: "Needs", color: "#faac6c", icon: "IconHeartFilled" },

{ 
  key: "Beauty Services", 
  name: "Beauty Services", 
  budgetType: "Needs", 
  color: "#faac6c", 
  icon: "IconFlowerFilled", 
  parentKey: "Personal Care",
  matchingPatterns: [
    "Kapper",
    "Hair",
    "Salon",
    "Beautysalon",
    "Schoonheid",
    "Nagel",
    "Nails",
    "Lash"
  ]
},

{ 
  key: "Cosmetics", 
  name: "Cosmetics", 
  budgetType: "Needs", 
  color: "#faac6c", 
  icon: "IconDropletFilled", 
  parentKey: "Personal Care",
  matchingPatterns: [
    "Douglas",
    "ICI Paris",
    "Kruidvat",
    "Etos",
    "Rituals",
    "Sephora",
    "Parfum"
  ]
},

{ 
  key: "Massage & Spa", 
  name: "Massage & Spa", 
  budgetType: "Needs", 
  color: "#faac6c", 
  icon: "IconSparklesFilled", 
  parentKey: "Personal Care",
  matchingPatterns: [
    "Massage",
    "Spa",
    "Wellness",
    "Sauna"
  ]
},

// Pets
{ key: "Pets", name: "Pets", budgetType: "Needs", color: "#4a35de", icon: "IconPawFilled" },

{ 
  key: "Veterinary", 
  name: "Veterinary", 
  budgetType: "Wants", 
  color: "#4a35de", 
  icon: "IconBoneFilled", 
  parentKey: "Pets",
  matchingPatterns: [
    "Dierenarts",
    "Dierenkliniek",
    "AniCura",
    "Evidensia",
    "Medpets",
    "Pets Place"
  ]
},
// Transportation
{ key: "Transportation", name: "Transportation", budgetType: "Needs", color: "#21cabe", icon: "IconCarFilled"},
{
  key: "Fuel",
  name: "Fuel",
  budgetType: "Needs",
  color: "#21cabe",
  icon: "IconGasStationFilled",
  parentKey: "Transportation",
  matchingPatterns: [
    "Shell",
    "BP",
    "Esso",
    "TotalEnergies",
    "Tango",
    "TinQ",
    "Avia",
    "Gulf"
  ]
},

{
  key: "Public Transportation",
  name: "Public Transportation",
  budgetType: "Needs",
  color: "#21cabe",
  icon: "IconTrainFilled",
  parentKey: "Transportation",
  matchingPatterns: [
    "NS",
    "Nederlandse Spoorwegen",
    "OV-chipkaart",
    "Connexxion",
    "Arriva",
    "GVB",
    "RET",
    "Qbuzz"
  ]
},

{
  key: "Parking",
  name: "Parking",
  budgetType: "Needs",
  color: "#21cabe",
  icon: "IconParkingCircleFilled",
  parentKey: "Transportation",
  matchingPatterns: [
    "Parkmobile",
    "EasyPark",
    "Yellowbrick",
    "Q-Park",
    "Interparking",
    "P1"
  ]
},
// Travel
{ key: "Travel", name: "Travel", budgetType: "Needs", color: "#de3575", icon: "IconWorldFilled" },

{ 
  key: "Accommodation", 
  name: "Accommodation", 
  budgetType: "Needs", 
  color: "#de3575", 
  icon: "IconHome2Filled", 
  parentKey: "Travel",
  matchingPatterns: [
    "Booking.com",
    "Booking",
    "Airbnb",
    "Hotels.com",
    "Expedia",
    "Trivago",
    "Belvilla",
    "Center Parcs",
    "Landal",
    "Roompot",
    "Vakantiepark",
    "Hotel",
    "Hostel"
  ]
},

{ 
  key: "Activities", 
  name: "Activities", 
  budgetType: "Needs", 
  color: "#de3575", 
  icon: "IconSpeedboatFilled", 
  parentKey: "Travel",
  matchingPatterns: [
    "GetYourGuide",
    "Viator",
    "Tripadvisor",
    "Tours",
    "Excursie",
    "Safari",
    "Attractie",
    "Museum"
  ]
},

{ 
  key: "Car Rentals", 
  name: "Car Rentals", 
  budgetType: "Needs", 
  color: "#de3575", 
  icon: "IconCaravanFilled", 
  parentKey: "Travel",
  matchingPatterns: [
    "Rentalcars",
    "Sixt",
    "Europcar",
    "Hertz",
    "Avis",
    "Budget",
    "Enterprise",
    "Sunny Cars",
    "Autoverhuur"
  ]
},

{ 
  key: "Flights", 
  name: "Flights", 
  budgetType: "Needs", 
  color: "#de3575", 
  icon: "IconPlaneDepartureFilled", 
  parentKey: "Travel",
  matchingPatterns: [
    "KLM",
    "Transavia",
    "Ryanair",
    "easyJet",
    "Vueling",
    "TUI Fly",
    "Corendon",
    "Lufthansa",
    "Schiphol",
    "Vliegticket",
    "Flight"
  ]
},

{ 
  key: "Travel Insurance", 
  name: "Travel Insurance", 
  budgetType: "Needs", 
  color: "#de3575", 
  icon: "IconShieldFilled", 
  parentKey: "Travel",
  matchingPatterns: [
    "Reisverzekering",
    "ANWB",
    "Allianz",
    "Centraal Beheer",
    "Univé",
    "Nationale Nederlanden",
    "Aegon"
  ]
},

];

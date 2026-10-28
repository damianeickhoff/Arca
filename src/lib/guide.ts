// Tips and page tours: which exist, and what the account remembers about them. Shared by
// the server (users.guide_state, app/actions/guide.ts) and the browser (lib/guide-context,
// lib/tips, components/page-tour), so no "use client" here.
//
//   • Page tours walk through a page the first time it is opened with something to show
//     (components/page-tour.tsx). One per page; steps and copy below and in `tours.*`.
//   • Tips are one-time explainers for rarer features: a card from the top
//     (<ContextualTip>), a pointer at one control (<AnchoredTip>) or the stepped tour of
//     a form (<FormTour>). Copy in `tips.<id>`.
//
// Both are stored per account, so each shows once on every device, and each has its own
// switch in Settings › Help.

import type { TipAnchor } from "@/lib/tip-placement";

export const TIP_IDS = [
  // Settings › Import › Bank connection: the account type chip in the link dialog
  "bankAccountType",
  // feature tips
  "receiptScan",
  "csvImport",
  "recurring",
  "recurringWholeWord",
  "merchant",
  "budgetStrategy",
  "importBalance",
  "dataHealth",
  "recentChanges",
  "debtLinkedPayment",
  "sharedCost",
  // stepped tours of a form (components/page-tour.tsx FormTour); copy at
  // tips.<id>.steps.<anchor>, one entry per control
  "debtFormTour",
  "savingsFormTour",
  // Import CSV: the date preview, the Check step, "Map columns" and the header row
  "importDatePreview",
  "importCheck",
  "importMapColumns",
  "importHeaderRow",
  // The Settings page's section list
  "settingsNav",
  // Updates: the "Arca was updated" card on Home (once per version, see
  // app/_home/whats-new-tip.tsx) and the backups card in Settings › Data health
  "whatsNew",
  "backups",
  // The opt-in update check: its switch in Settings › About, and the "x.y.z is out"
  // card on Home (once per newer version, app/_home/update-available-tip.tsx)
  "updateCheck",
  "updateAvailable",
  // The Beta chip under the logo on dev and local builds (shell/app-shell.tsx BuildChip)
  "betaBuild",
  // Settings › About on prerelease builds: the commits since the last release
  "betaChanges",
  // The budget editor dialog
  "budgetAddCategory",
  // Shared pickers and search
  "categoryPickerByGroup",
  "categoryPickerSuggestions",
  "dateQuickPicks",
  "searchActions",
  // Detail popups (merchant, category, recurring)
  "merchantVisits",
  "categoryMerchants",
  "recurringCharges",
  "recurringMatchPreview",
  // Settings › Accounts
  "accountsAdd",
  "accountsOverdraft",
  // Transaction popups
  "addTransactionAnother",
  "correctAmountPreview",
  "receiptViewer",
  "rulePreview",
  "splitSharedCost",
  "linkSearchOlder",
  // Settings panels
  "financialMonthDays",
  "financialMonthExceptions",
  "merchantsWithoutIcon",
  "categoryGroups",
  // Payment plans: the Payment plan type in the recurring editor
  "paymentPlan",
  // AI: the row in Settings, Needs a category's Ask AI and its kept picks, the provider switch
  "aiSettings",
  "aiCategories",
  "aiPicksKept",
  "aiProvider",
  // The one icon picker: its Icons · Brands tabs, and the whole Tabler set
  "iconPicker",
  "iconPickerAllIcons",
  // Merchant-first rules: the teach strip, a merchant's patterns, Needs a category's
  // Worth teaching strip, a new rule's matches and a rule per merchant for several picks
  "ruleTeach",
  "merchantPatterns",
  "reviewTeach",
  "ruleMatches",
  "reviewBulkRules",
  // Bank connection (Enable Banking): Import › Connect a bank
  "bankConnection",
  // Import: the bank connection and the CSV upload as two tabs
  "importTabs",
  // Help: the online guide (Settings › Help)
  "helpGuide",
  // Invite links (Settings › Users)
  "userInvites",
  // Recurring detection: the review strip on Upcoming and Settings › Recurring
  "recurringSuggestions",
  "recurringScan",
  // Notifications: the sidebar row / Home's bell, and "Push to this device" in Settings
  "notifications",
  "pushDevice",
] as const;

export type TipId = (typeof TIP_IDS)[number];

export function isTipId(value: unknown): value is TipId {
  return typeof value === "string" && (TIP_IDS as readonly string[]).includes(value);
}

/** One step of a page tour: copy at `tours.<tour>.steps.<key>`, the element by its
 *  `data-tip-anchor` (the first that is laid out when phone and desktop differ). A step
 *  whose element is not on the page when the tour starts is left out. */
export interface TourStep {
  key: string;
  anchor: TipAnchor | readonly TipAnchor[];
}

export interface TourDef {
  /** Where Replay in Settings › Help takes you. */
  href: string;
  steps: readonly TourStep[];
  /** A page that is empty until you add one: Settings says the tour starts after it. */
  startsAfter?: "debt" | "goal";
}

export const TOURS = {
  home: {
    href: "/",
    steps: [
      { key: "safeToSpend", anchor: "homeHero" },
      { key: "thisMonth", anchor: "homeThisMonth" },
      { key: "moneyFlow", anchor: "homeMoneyFlow" },
      { key: "add", anchor: ["quickAdd", "quickAddPhone"] },
    ],
  },
  activity: {
    href: "/transactions",
    steps: [
      { key: "period", anchor: "activityPeriod" },
      { key: "find", anchor: ["activityFilters", "activitySearchBar"] },
      { key: "row", anchor: "activityRow" },
      // Desktop: the transaction beside the list (on a phone it opens as a sheet).
      { key: "detail", anchor: "activityDetail" },
    ],
  },
  needsReview: {
    href: "/transactions/needs-review",
    steps: [
      { key: "card", anchor: "needsReviewCard" },
      { key: "transfer", anchor: "reviewTransfer" },
      { key: "select", anchor: "needsReviewSelect" },
    ],
  },
  upcoming: {
    href: "/transactions/upcoming",
    steps: [
      { key: "month", anchor: "upcomingMonthNav" },
      { key: "status", anchor: "billStatusControl" },
      { key: "nextMonth", anchor: "upcomingNextMonth" },
    ],
  },
  budget: {
    href: "/budget",
    steps: [
      { key: "plan", anchor: "planSwitch" },
      { key: "period", anchor: "budgetPeriodNav" },
      { key: "category", anchor: "budgetCategoryRow" },
      { key: "strategy", anchor: "budgetStrategy" },
    ],
  },
  debts: {
    href: "/debts",
    startsAfter: "debt",
    steps: [
      { key: "owe", anchor: "debtsOwe" },
      { key: "payments", anchor: "debtsPaymentsMonth" },
      { key: "extra", anchor: "debtsSimulator" },
    ],
  },
  goals: {
    href: "/goals",
    startsAfter: "goal",
    steps: [
      { key: "goal", anchor: "goalsDetail" },
      { key: "contributions", anchor: "goalsContributions" },
    ],
  },
  insights: {
    href: "/reports",
    steps: [
      { key: "tabs", anchor: "insightsTabs" },
      { key: "summary", anchor: "insightsSummary" },
      { key: "runningTotal", anchor: "insightsRunningTotal" },
      { key: "whereItWent", anchor: "insightsBlockMap" },
      { key: "merchants", anchor: "insightsMerchants" },
    ],
  },
} as const satisfies Record<string, TourDef>;

export type TourId = keyof typeof TOURS;

/** In the order Settings › Help lists them. */
export const TOUR_IDS = Object.keys(TOURS) as TourId[];

export function isTourId(value: unknown): value is TourId {
  return typeof value === "string" && value in TOURS;
}

/** What the account remembers (users.guide_state, JSON). */
export interface GuideState {
  /** The two switches in Settings › Help. */
  toursOn: boolean;
  tipsOn: boolean;
  /** Recorded the moment one appears, not when it is acknowledged: the promise is
   *  "never more than once", not "until you read it". */
  tipsSeen: TipId[];
  toursSeen: TourId[];
  /** The version the "Arca was updated" card last spoke about (null: none yet, so the
   *  first version an account sees is recorded without a card). */
  whatsNewVersion: string | null;
  /** The newer version the "x.y.z is out" card last announced. */
  updateAvailableVersion: string | null;
}

export const EMPTY_GUIDE: GuideState = {
  toursOn: true,
  tipsOn: true,
  tipsSeen: [],
  toursSeen: [],
  whatsNewVersion: null,
  updateAvailableVersion: null,
};

/** Reads the stored JSON, dropping ids that no longer exist. Never throws. */
export function parseGuideState(raw: string | null | undefined): GuideState {
  if (!raw) return EMPTY_GUIDE;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return EMPTY_GUIDE;
  }
  if (!value || typeof value !== "object") return EMPTY_GUIDE;
  const v = value as Record<string, unknown>;
  return {
    toursOn: v.toursOn !== false,
    tipsOn: v.tipsOn !== false,
    tipsSeen: Array.isArray(v.tipsSeen) ? [...new Set(v.tipsSeen.filter(isTipId))] : [],
    toursSeen: Array.isArray(v.toursSeen) ? [...new Set(v.toursSeen.filter(isTourId))] : [],
    whatsNewVersion: typeof v.whatsNewVersion === "string" ? v.whatsNewVersion : null,
    updateAvailableVersion: typeof v.updateAvailableVersion === "string" ? v.updateAvailableVersion : null,
  };
}

/** One change to the record. The browser applies it at once and the server action
 *  applies the same change to the stored copy, so both always agree. */
export type GuideChange =
  | { kind: "tipSeen"; id: TipId }
  | { kind: "tourSeen"; id: TourId }
  | { kind: "switch"; which: "tours" | "tips"; on: boolean }
  | { kind: "version"; which: "whatsNew" | "updateAvailable"; version: string }
  /** "Show every tip and tour again": forgets what was seen and turns both back on. */
  | { kind: "reset" }
  /** What one browser remembered before this lived on the account (localStorage
   *  `arca:tips`, `arca:whatsNewVersion`, `arca:updateAvailableSeen`). */
  | { kind: "legacy"; tipsSeen: string[]; tipsOff: boolean; whatsNewVersion: string | null; updateAvailableVersion: string | null };

export function applyGuideChange(state: GuideState, change: GuideChange): GuideState {
  switch (change.kind) {
    case "tipSeen":
      return state.tipsSeen.includes(change.id) ? state : { ...state, tipsSeen: [...state.tipsSeen, change.id] };
    case "tourSeen":
      return state.toursSeen.includes(change.id) ? state : { ...state, toursSeen: [...state.toursSeen, change.id] };
    case "switch":
      return change.which === "tours" ? { ...state, toursOn: change.on } : { ...state, tipsOn: change.on };
    case "version":
      return change.which === "whatsNew" ? { ...state, whatsNewVersion: change.version } : { ...state, updateAvailableVersion: change.version };
    case "reset":
      return { ...state, toursOn: true, tipsOn: true, tipsSeen: [], toursSeen: [] };
    case "legacy":
      return {
        ...state,
        tipsSeen: [...new Set([...state.tipsSeen, ...change.tipsSeen.filter(isTipId)])],
        tipsOn: state.tipsOn && !change.tipsOff,
        whatsNewVersion: state.whatsNewVersion ?? change.whatsNewVersion,
        updateAvailableVersion: state.updateAvailableVersion ?? change.updateAvailableVersion,
      };
  }
}

/** Validates a change that came in over the wire (a server action's argument). */
export function isGuideChange(value: unknown): value is GuideChange {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  const isVersion = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 40;
  switch (c.kind) {
    case "tipSeen":
      return isTipId(c.id);
    case "tourSeen":
      return isTourId(c.id);
    case "switch":
      return (c.which === "tours" || c.which === "tips") && typeof c.on === "boolean";
    case "version":
      return (c.which === "whatsNew" || c.which === "updateAvailable") && isVersion(c.version);
    case "reset":
      return true;
    case "legacy":
      return (
        Array.isArray(c.tipsSeen) && c.tipsSeen.length <= 500 && c.tipsSeen.every((id) => typeof id === "string") &&
        typeof c.tipsOff === "boolean" &&
        (c.whatsNewVersion === null || isVersion(c.whatsNewVersion)) &&
        (c.updateAvailableVersion === null || isVersion(c.updateAvailableVersion))
      );
    default:
      return false;
  }
}

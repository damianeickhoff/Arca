"use client";

// The anchors that pointer tips and tour steps point at, and the geometry of a pointer
// tip (<AnchoredTip>): where its card and highlight ring go for a given control. Page
// and form tours place their own card (components/page-tour.tsx). Lifecycle, storage
// and copy all stay with the components.

/** Mark the element a tip or a tour step points at: `data-tip-anchor="homeHero"`. A
 *  plain data attribute rather than a ref so the tip can be declared anywhere in the
 *  tree — several of these controls sit deep inside components that have no business
 *  knowing a tip exists. */
export type TipAnchor =
  // ── Page tours (lib/guide.ts TOURS) ──
  // Home: Safe to spend, This month, Money flow and the + (sidebar / tab bar)
  | "homeHero"
  | "homeThisMonth"
  | "homeMoneyFlow"
  | "quickAdd"
  | "quickAddPhone"
  // Activity: the period card, the filters (desktop) or the docked search (phone), the
  // first row and the transaction beside the list
  | "activityPeriod"
  | "activityFilters"
  | "activitySearchBar"
  | "activityRow"
  | "activityDetail"
  // Needs a category: the current transaction, Internal transfer and Select
  | "needsReviewCard"
  | "reviewTransfer"
  | "needsReviewSelect"
  // Upcoming: the month arrows, a bill's status and next month
  | "upcomingMonthNav"
  | "billStatusControl"
  | "upcomingNextMonth"
  // Plan › Budget: the Plan switch, the period, a category row and the strategy
  | "planSwitch"
  | "budgetPeriodNav"
  | "budgetCategoryRow"
  | "budgetStrategy"
  // Plan › Debts: You owe, this month's payments and the simulator
  | "debtsOwe"
  | "debtsPaymentsMonth"
  | "debtsSimulator"
  // Plan › Goals: a goal and the contributions
  | "goalsDetail"
  | "goalsContributions"
  // Insights › Overview: the tab row, the summary, the running total, Where it went, merchants
  | "insightsTabs"
  | "insightsSummary"
  | "insightsRunningTotal"
  | "insightsBlockMap"
  | "insightsMerchants"
  // ── Form tours (components/page-tour.tsx FormTour) ──
  // Debt form fields
  | "debtDirection"
  | "debtIcon"
  | "debtStartDate"
  | "debtBalanceDate"
  | "debtMinPayment"
  | "debtOriginalAmount"
  | "debtInterest"
  | "debtAutoBill"
  | "debtNote"
  | "debtLinkedBills"
  | "debtSave"
  | "debtHelp"
  // Goal form controls (the new-saving tour)
  | "savingClose"
  | "savingIcon"
  | "savingTarget"
  | "savingDates"
  | "savingMonthly"
  | "savingBalance"
  | "savingCategory"
  | "savingSave"
  | "savingHelp"
  // ── Pointer tips (<AnchoredTip>) ──
  // Bank connection link dialog: the account type the bank reports
  | "bankAccountType"
  // Import CSV: the date preview, the Check step's summary, "Map columns" and the header-row picker
  | "importDatePreview"
  | "importCheck"
  | "importMapColumns"
  | "importHeaderRow"
  // Settings: Data health in the phone sheet, the change log
  | "dataHealthMenu"
  | "recentChanges"
  // The Settings page's section list
  | "settingsNav"
  // Detail popups: the merchant profile's visit strip, the category detail's merchant
  // breakdown and a recurring item's last 12 charges
  | "merchantVisits"
  | "categoryMerchants"
  | "recurringCharges"
  // The recurring editor's live "what would this rule match" chart and its type switch
  | "recurringMatchPreview"
  | "recurringType"
  // The budget editor: add a category
  | "budgetAddCategory"
  // Settings › Accounts: the "Add bank account" button and the Bank accounts heading
  | "accountsAdd"
  | "accountsBanks"
  // Settings › Financial month: the start-day grid and the per-month exceptions;
  // Settings › Merchants: the All / Without icon switch
  | "financialMonthDays"
  | "financialMonthExceptions"
  | "merchantsWithoutIcon"
  // Settings › Categories: the grouped list
  | "categoryGroups"
  // Transaction popups: Add transaction's "Save and add another", the Correct amount
  // budget preview, the receipt viewer's zoom bar, the rule dialog's live match preview,
  // the split dialog's shared-cost section and the link dialog's search
  | "addTransactionAnother"
  | "correctAmountPreview"
  | "receiptZoom"
  | "rulePreview"
  | "splitSharedCost"
  | "linkSearch"
  // AI: the Settings row, Needs a category's Ask AI, the provider switch
  | "settingsAi"
  | "aiCategories"
  | "aiProvider"
  // The one icon picker: its Icons · Brands tabs and the All icons heading
  | "iconPickerTabs"
  | "iconPickerAllIcons"
  // Notifications: the sidebar row, Home's phone bell, Settings › Notifications' push button
  | "notificationsNav"
  | "notificationsBell"
  | "pushDevice"
  // Merchant-first rules: the teach strip, a merchant's patterns, Needs a category's
  // Worth teaching strip and a rule's "Show the N transactions"
  | "ruleTeach"
  | "merchantPatterns"
  | "reviewTeach"
  | "ruleMatches"
  // Import: Connect a bank and the CSV · Bank connection tabs
  | "bankConnect"
  | "importTabs"
  // The Settings page: the Help row (the online guide)
  | "settingsHelp"
  // Settings › Data health and About: regular payments, backups, the update check, the
  // Beta chip and the commits in this build
  | "recurringScan"
  | "backups"
  | "updateCheck"
  | "betaBuild"
  | "betaChanges";

export const CARD_WIDTH = 320;
/** Breathing room between the card and the control it points at. */
export const GAP = 12;
/** Minimum distance from the card to the edge of the screen. */
export const GUTTER = 12;
export const ARROW = 12;
/** Room a pointer card needs on one side of its control — about the height of a
 *  compact card with two lines of copy and its buttons. */
export const MIN_ROOM = 200;
/** How long to keep looking for the anchor before giving up — it may be below the
 *  fold, still streaming in, or simply not on this screen. */
export const ANCHOR_TIMEOUT_MS = 4000;
export const ANCHOR_POLL_MS = 150;

export interface Placement {
  /** Viewport rect of the anchor, used for the highlight ring. */
  anchor: { top: number; left: number; width: number; height: number; radius: string };
  /** Card box — one of top/bottom is set, never both. */
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  below: boolean;
  /** Tallest the card may get before it scrolls, so it never runs off the screen. */
  maxHeight: number;
  /** False when the control fills so much of the screen that neither side has room:
   *  the card then sits over it, pinned to the bottom edge, without an arrow. */
  arrow: boolean;
  /** Arrow offset from the card's left edge, clamped so it stays on the card. */
  arrowX: number;
}

/** Grow a computed `border-radius` so the ring sits parallel to the control's own
 *  corners. Bails out to a sane fixed radius for the elliptical (`10px / 20px`) form,
 *  which nothing in this app uses and which won't survive a per-token calc(). */
export function inflateRadius(radius: string, by: number) {
  if (!radius || radius.includes("/")) return "16px";
  return radius
    .split(/\s+/)
    .map((token) => `calc(${token} + ${by}px)`)
    .join(" ");
}

export function measure(el: Element): Placement | null {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Zero-sized means hidden (display:none, an unmounted panel, a collapsed row);
  // fully off-screen means the user has scrolled past whatever this is about. Either
  // way there's nothing to point at, so the caller stands down.
  if (r.width === 0 && r.height === 0) return null;
  if (r.bottom < 0 || r.top > vh) return null;

  // Is the control the thing you'd actually hit if you tapped it? A hit-test at its
  // own centre catches everything a rect can't see: a full-screen portal covering the
  // dashboard, a sheet over the list, a faded-out header row. Cheaper and far more
  // general than teaching every call site which overlays exist above it.
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (!hit || !el.contains(hit)) return null;

  const width = Math.min(CARD_WIDTH, vw - GUTTER * 2);
  const centre = r.left + r.width / 2;
  const left = Math.min(Math.max(centre - width / 2, GUTTER), vw - GUTTER - width);

  // Placed by which half of the screen the anchor sits in, rather than by measuring
  // the card: the card's height depends on how the copy wraps, so measuring it means
  // rendering first and moving afterwards — a visible jump. Anchoring the far edge
  // (bottom, for a card above) lets it grow in the safe direction instead.
  // A tall control (a whole card, a long list) or one half scrolled out of view can
  // leave too little room on that side, though, and the card would run off the
  // screen: then try the other side, and if neither fits, lay it over the control.
  const roomBelow = vh - Math.max(r.bottom, 0) - GAP - GUTTER;
  const roomAbove = Math.min(r.top, vh) - GAP - GUTTER;
  const prefersBelow = r.top + r.height / 2 < vh / 2;
  const side: "below" | "above" | "over" =
    (prefersBelow ? roomBelow : roomAbove) >= MIN_ROOM
      ? prefersBelow ? "below" : "above"
      : roomBelow >= MIN_ROOM ? "below"
      : roomAbove >= MIN_ROOM ? "above"
      : "over";
  const below = side === "below";

  return {
    anchor: { top: r.top, left: r.left, width: r.width, height: r.height, radius: getComputedStyle(el).borderRadius },
    left,
    top: below ? Math.max(r.bottom, 0) + GAP : undefined,
    bottom: side === "above" ? vh - r.top + GAP : side === "over" ? GUTTER : undefined,
    width,
    below,
    maxHeight: side === "below" ? roomBelow : side === "above" ? roomAbove : vh - GUTTER * 2,
    arrow: side !== "over",
    arrowX: Math.min(Math.max(centre - left, 24), width - 24),
  };
}

export function samePlacement(a: Placement | null, b: Placement | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.left === b.left && a.top === b.top && a.bottom === b.bottom &&
    a.width === b.width && a.arrowX === b.arrowX && a.below === b.below &&
    a.maxHeight === b.maxHeight && a.arrow === b.arrow &&
    a.anchor.top === b.anchor.top && a.anchor.left === b.anchor.left &&
    a.anchor.width === b.anchor.width && a.anchor.height === b.anchor.height
  );
}

export function findAnchor(anchor: TipAnchor): Element | null {
  // Several elements can carry the same anchor when one responsive layout renders a
  // phone and a desktop variant side by side (the tab bar and the sidebar nav, say),
  // one of them display:none. Point at the one that is actually laid out.
  const all = document.querySelectorAll(`[data-tip-anchor="${anchor}"]`);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) return el;
  }
  return all[0] ?? null;
}

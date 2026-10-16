"use client";

// Geometry shared by the two anchored tip shapes — <AnchoredTip> (one pointer tip) and
// <TipWalkthrough> (a stepped tour of several controls). Pure measurement only: where a
// card and its highlight ring go for a given control. Lifecycle, storage and copy all
// stay with the components.

/** Mark the control a tip points at: `data-tip-anchor="budgetButton"`. A plain data
 *  attribute rather than a ref so the tip can be declared anywhere in the tree —
 *  several of these controls sit deep inside components that have no business
 *  knowing a tip exists. */
export type TipAnchor =
  | "budgetButton"
  | "budgetEdit"
  | "reportsButton"
  | "settingsTrigger"
  | "transactionRow"
  | "healthCard"
  | "importDatePreview"
  // Redesigned Import CSV: the Check step's summary and "Map columns"
  | "importCheck"
  | "importMapColumns"
  | "dataHealthMenu"
  | "transactionListRow"
  // App shell: the phone tab bar / desktop sidebar nav, and the Plan switch
  | "mainNav"
  | "planSwitch"
  // The Settings page's section list
  | "settingsNav"
  // Home sections (Clear)
  | "homeHero"
  | "homeComingUp"
  | "homeIncomeVsSpending"
  | "homeMoneyFlow"
  // Privacy mode: the eye button on Home's hero
  | "privacyEye"
  // Redesigned Activity
  | "activityRow"
  | "activityFilters"
  | "activityDetail"
  | "activitySearchBar"
  | "activityHistory"
  | "globalSearch"
  | "globalSearchPhone"
  | "activityKeys"
  | "activityDetailTabs"
  // Redesigned Insights
  | "insightsMerchants"
  | "insightsCategorySwitch"
  | "insightsNeedsWants"
  | "insightsHealthNextStep"
  | "insightsHealthHistory"
  | "insightsComingUp"
  | "insightsForecastRange"
  | "insightsNetWorthRange"
  // Redesigned Goals
  | "goalsContributions"
  | "goalsDetail"
  | "goalsSuggestions"
  // Redesigned Debts
  | "debtsDetail"
  | "debtsSimulator"
  | "debtsSortAndImpact"
  | "debtsOwed"
  // Redesigned Budget
  | "budgetStrategy"
  | "budgetMove"
  | "budgetBills"
  | "budgetUnbudgeted"
  | "budgetAddCategory"
  | "budgetPeriodNav"
  // Debt form fields (walkthrough)
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
  // Goal form controls (the new-saving walkthrough)
  | "savingClose"
  | "savingIcon"
  | "savingTarget"
  | "savingDates"
  | "savingMonthly"
  | "savingBalance"
  | "savingCategory"
  | "savingSave"
  | "savingHelp"
  // Detail popups: the merchant profile's visit strip, the category detail's merchant
  // breakdown and a recurring item's last 12 charges
  | "merchantVisits"
  | "categoryMerchants"
  | "recurringCharges"
  // The recurring editor's live "what would this rule match" chart, and a Budget
  // category row (opens the category detail)
  | "recurringMatchPreview"
  | "budgetCategoryRow"
  // Settings › Accounts: the "Add bank account" button
  | "accountsAdd"
  // Settings › Financial month: the start-day grid; Settings › Merchants: the
  // All / Without icon switch
  | "financialMonthDays"
  | "merchantsWithoutIcon"
  // Settings › Categories: the grouped list; Insights: the Groups / Categories switch
  | "categoryGroups"
  | "insightsGroupSwitch"
  // Transaction popups: Add transaction's "Save and add another", the Correct amount
  // budget preview and the receipt viewer's zoom bar
  | "addTransactionAnother"
  | "correctAmountPreview"
  | "receiptZoom"
  // Transaction popups: the rule dialog's live match preview, the split dialog's
  // shared-cost section and the link dialog's search over older expenses
  | "rulePreview"
  | "splitSharedCost"
  | "linkSearch"
  // Upcoming's month arrows and the Needs a category queue's Select button
  | "upcomingMonthNav"
  | "needsReviewSelect"
  // Settings › Accounts: the Bank accounts heading (overdraft limits)
  | "accountsBanks"
  // The recurring editor's type switch (Payment plan)
  | "recurringType";

export const CARD_WIDTH = 320;
/** Breathing room between the card and the control it points at. */
export const GAP = 12;
/** Minimum distance from the card to the edge of the screen. */
export const GUTTER = 12;
export const ARROW = 12;
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
  const below = r.top + r.height / 2 < vh / 2;

  return {
    anchor: { top: r.top, left: r.left, width: r.width, height: r.height, radius: getComputedStyle(el).borderRadius },
    left,
    top: below ? r.bottom + GAP : undefined,
    bottom: below ? undefined : vh - r.top + GAP,
    width,
    below,
    arrowX: Math.min(Math.max(centre - left, 24), width - 24),
  };
}

export function samePlacement(a: Placement | null, b: Placement | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.left === b.left && a.top === b.top && a.bottom === b.bottom &&
    a.width === b.width && a.arrowX === b.arrowX && a.below === b.below &&
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

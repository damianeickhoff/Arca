"use client";

import type { ComponentType } from "react";
import { useTranslations } from "next-intl";
import {
  IconSparkles,
  IconFolders,
  IconAdjustments,
  IconBrandGoogle,
  IconBuildingBank,
  IconBuildingStore,
  IconCalendarCheck,
  IconCamera,
  IconChartBar,
  IconChecklist,
  IconCompass,
  IconCalendarDue,
  IconCalendarStats,
  IconCalculator,
  IconEyeOff,
  IconLayoutSidebar,
  IconChartLine,
  IconLayoutSidebarRight,
  IconFilter,
  IconSearch,
  IconChartBarPopular,
  IconArrowsVertical,
  IconFileTextFilled,
  IconHandFinger,
  IconHeartbeat,
  IconKeyboard,
  IconReload,
  IconScale,
  IconSettings,
  IconStethoscope,
  IconTextWrap,
  IconTrendingUp,
  IconUsers,
  IconWallet,
  IconArrowsExchange,
  IconArrowsSort,
  IconTag,
  IconFilter2,
  IconTarget,
  IconCirclePlus,
  IconZoomIn,
  IconIcons,
  IconWand,
  IconFingerprint,
} from "@tabler/icons-react";

import type { TipId } from "@/lib/tips";

const TIP_ICONS: Record<TipId, ComponentType<{ className?: string }>> = {
  receiptScan: IconCamera,
  csvImport: IconFileTextFilled,
  recurring: IconReload,
  recurringWholeWord: IconTextWrap,
  googleLookup: IconBrandGoogle,
  debtLinkedPayment: IconReload,
  debtFormTour: IconHandFinger,
  savingsFormTour: IconHandFinger,
  sharedCost: IconUsers,
  merchant: IconBuildingStore,
  budget: IconWallet,
  budgetStrategy: IconAdjustments,
  reports: IconChartBar,
  forecast: IconTrendingUp,
  health: IconHeartbeat,
  keyboardShortcuts: IconKeyboard,
  importBalance: IconScale,
  dataHealth: IconStethoscope,
  importDatePreview: IconCalendarCheck,
  importCheck: IconChecklist,
  importMapColumns: IconAdjustments,
  bulkSelect: IconChecklist,
  budgetLocation: IconWallet,
  reportsLocation: IconChartBar,
  healthCard: IconHeartbeat,
  settingsLocation: IconSettings,
  strategyLocation: IconAdjustments,
  transactionDetail: IconHandFinger,
  clearNavigation: IconLayoutSidebar,
  settingsNav: IconSettings,
  homeMoneyFlow: IconChartLine,
  planHub: IconCompass,
  homeSafeToSpendSum: IconCalculator,
  privacyEye: IconEyeOff,
  homeComingUp: IconCalendarDue,
  homeIncomeVsSpending: IconChartBar,
  activityDetail: IconLayoutSidebarRight,
  activityFilters: IconFilter,
  activityBulkSelect: IconChecklist,
  activitySearchBar: IconSearch,
  activityHistory: IconChartBarPopular,
  globalSearch: IconSearch,
  activityKeys: IconArrowsVertical,
  activityDetailTabs: IconLayoutSidebarRight,
  budgetStrategyTarget: IconAdjustments,
  budgetUnbudgeted: IconTag,
  budgetMove: IconArrowsExchange,
  budgetBills: IconCalendarDue,
  budgetAddCategory: IconTag,
  budgetPeriodNav: IconCalendarDue,
  debtsDetail: IconLayoutSidebarRight,
  debtsSimulator: IconTrendingUp,
  debtsSortAndImpact: IconArrowsSort,
  debtsOwed: IconUsers,
  goalsContributions: IconChartBar,
  goalsDetail: IconChartLine,
  goalsSuggestions: IconTarget,
  insightsMerchants: IconBuildingStore,
  insightsCategorySwitch: IconArrowsExchange,
  insightsNeedsWants: IconChartBar,
  insightsHealthNextStep: IconTarget,
  insightsHealthHistory: IconHeartbeat,
  insightsComingUp: IconCalendarDue,
  insightsForecastRange: IconCalendarStats,
  insightsNetWorthRange: IconChartLine,
  categoryPickerByGroup: IconTag,
  categoryPickerSuggestions: IconFilter2,
  dateQuickPicks: IconCalendarCheck,
  searchActions: IconKeyboard,
  merchantVisits: IconChartBar,
  categoryMerchants: IconBuildingStore,
  recurringCharges: IconTrendingUp,
  recurringMatchPreview: IconChartBar,
  budgetCategoryDetail: IconHandFinger,
  accountsAdd: IconBuildingBank,
  addTransactionAnother: IconCirclePlus,
  correctAmountPreview: IconScale,
  receiptViewer: IconZoomIn,
  rulePreview: IconFilter,
  splitSharedCost: IconUsers,
  linkSearchOlder: IconSearch,
  upcomingMonthNav: IconCalendarDue,
  needsReviewTriage: IconTag,
  needsReviewBulk: IconChecklist,
  financialMonthDays: IconCalendarStats,
  merchantsWithoutIcon: IconBuildingStore,
  categoryGroups: IconFolders,
  insightsGroupSwitch: IconFolders,
  accountsOverdraft: IconBuildingBank,
  paymentPlan: IconCalendarDue,
  aiSettings: IconSparkles,
  aiCategories: IconSparkles,
  aiSummary: IconSparkles,
  iconPicker: IconIcons,
  reviewTeach: IconWand,
  merchantPatterns: IconFingerprint,
  ruleTeach: IconWand,
};

/**
 * The card itself, shared by both tip shapes — <ContextualTip> pins it to the top of
 * the screen, <AnchoredTip> parks it next to a control. Positioning is entirely the
 * caller's business; this is only the surface, so the two shapes can never drift
 * apart visually.
 *
 * Opaque, not glass: a tip can land over a chart or a busy list, and the text has to
 * stay readable against whatever happens to be behind it. Copy comes from the `tips`
 * namespace, keyed by id.
 */
export function TipCard({
  id,
  onDismiss,
  onDismissAll,
  compact = false,
  title,
  body,
  footer,
}: {
  id: TipId;
  onDismiss: () => void;
  onDismissAll: () => void;
  /** Pointer tips sit next to a control rather than across the top, so they drop the
   *  icon chip and run a size tighter — the control they point at is the icon. */
  compact?: boolean;
  /** Copy overrides. A walkthrough has one card per step, so its text can't come from
   *  the tip id the way a single-shot tip's does; everything else omits these and gets
   *  the `tips.<id>` copy as before. */
  title?: string;
  body?: string;
  /** Replaces the "Don't show again" / "Got it" pair — a walkthrough steers with
   *  Back/Next instead. */
  footer?: React.ReactNode;
}) {
  const t = useTranslations("tips");
  const Icon = TIP_ICONS[id];

  return (
    <div className="pointer-events-auto rounded-clear-tile border border-clear-line bg-clear-card shadow-clear-float p-4">
      <div className="flex gap-3">
        {!compact && (
          <div className="size-10 shrink-0 rounded-full bg-clear-ember flex items-center justify-center">
            <Icon className="size-5 text-clear-ember-ink" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-extrabold tracking-[-0.02em] text-[15px] leading-tight text-clear-ink">{title ?? t(`${id}.title`)}</p>
          <p className="mt-1 text-sm text-clear-ink-2 leading-snug">{body ?? t(`${id}.body`)}</p>
        </div>
      </div>

      {footer ?? (
        <div className="mt-3.5 flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onDismissAll}
            className="h-9 px-3 rounded-full text-sm font-semibold text-clear-muted active:scale-[0.97] transition-transform"
          >
            {t("dontShowAgain")}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="h-9 px-5 rounded-full bg-clear-primary text-clear-primary-ink text-sm font-bold active:scale-[0.97] transition-transform"
          >
            {t("gotIt")}
          </button>
        </div>
      )}
    </div>
  );
}

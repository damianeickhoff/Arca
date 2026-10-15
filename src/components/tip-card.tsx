"use client";

import type { ComponentType } from "react";
import { useTranslations } from "next-intl";
import {
  IconAdjustments,
  IconBrandGoogle,
  IconBuildingStore,
  IconCalendarCheck,
  IconCamera,
  IconChartBar,
  IconChecklist,
  IconCompass,
  IconCalendarDue,
  IconChartDonut,
  IconLayoutSidebar,
  IconBolt,
  IconSun,
  IconLayoutSidebarRight,
  IconFilter,
  IconSearch,
  IconChartBarPopular,
  IconArrowsVertical,
  IconCalendarStats,
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
  bulkSelect: IconChecklist,
  budgetLocation: IconWallet,
  reportsLocation: IconChartBar,
  healthCard: IconHeartbeat,
  settingsLocation: IconSettings,
  strategyLocation: IconAdjustments,
  transactionDetail: IconHandFinger,
  newNavigation: IconLayoutSidebar,
  planHub: IconCompass,
  homeSafeToSpend: IconCalendarStats,
  homeQuickActions: IconBolt,
  homeNudge: IconSun,
  homeComingUp: IconCalendarDue,
  homeSpending: IconChartDonut,
  activityDetail: IconLayoutSidebarRight,
  activityFilters: IconFilter,
  activityBulkSelect: IconChecklist,
  activitySearchBar: IconSearch,
  activityContext: IconChartBarPopular,
  activityKeys: IconArrowsVertical,
  budgetStrategyCard: IconAdjustments,
  budgetMove: IconArrowsExchange,
  budgetBills: IconCalendarDue,
  debtsDetail: IconLayoutSidebarRight,
  debtsSimulator: IconTrendingUp,
  debtsOwed: IconUsers,
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
    <div className="pointer-events-auto rounded-banner border border-line bg-surface shadow-float p-4">
      <div className="flex gap-3">
        {!compact && (
          <div className="size-10 shrink-0 rounded-full bg-mustard flex items-center justify-center">
            <Icon className="size-5 text-mustard-ink" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="heading text-[15px] leading-tight text-ink">{title ?? t(`${id}.title`)}</p>
          <p className="mt-1 text-sm text-ink-2 leading-snug">{body ?? t(`${id}.body`)}</p>
        </div>
      </div>

      {footer ?? (
        <div className="mt-3.5 flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onDismissAll}
            className="h-9 px-3 rounded-full text-sm font-semibold text-ink-3 active:scale-[0.97] transition-transform"
          >
            {t("dontShowAgain")}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="h-9 px-5 rounded-full bg-ink text-bg text-sm font-bold active:scale-[0.97] transition-transform"
          >
            {t("gotIt")}
          </button>
        </div>
      )}
    </div>
  );
}

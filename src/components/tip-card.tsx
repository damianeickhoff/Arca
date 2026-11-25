"use client";

import type { ComponentType } from "react";
import { useTranslations } from "next-intl";
import {
  IconServer,
  IconBook2,
  IconUserPlus,
  IconRepeat,
  IconSparkles,
  IconFolders,
  IconAdjustments,
  IconBuildingBank,
  IconBuildingStore,
  IconCalendarCheck,
  IconCamera,
  IconChartBar,
  IconChecklist,
  IconListCheck,
  IconCalendarDue,
  IconCalendarEvent,
  IconCalendarStats,
  IconFilter,
  IconSearch,
  IconFileTextFilled,
  IconHandFinger,
  IconKeyboard,
  IconReload,
  IconScale,
  IconSettings,
  IconStethoscope,
  IconTextWrap,
  IconTrendingUp,
  IconUsers,
  IconArrowsExchange,
  IconTag,
  IconFilter2,
  IconCirclePlus,
  IconZoomIn,
  IconCategory2,
  IconIcons,
  IconWand,
  IconFingerprint,
  IconHistory,
  IconTableRow,
  IconDatabase,
  IconDownload,
  IconFlask,
  IconGitCommit,
  IconGift,
  IconRefresh,
  IconBell,
  IconDeviceMobileMessage,
} from "@tabler/icons-react";

import type { TipId } from "@/lib/guide";

const TIP_ICONS: Record<TipId, ComponentType<{ className?: string }>> = {
  bankAccountType: IconTag,
  bankImportFrom: IconCalendarEvent,
  receiptScan: IconCamera,
  csvImport: IconFileTextFilled,
  recurring: IconReload,
  recurringWholeWord: IconTextWrap,
  debtLinkedPayment: IconReload,
  debtFormTour: IconHandFinger,
  savingsFormTour: IconHandFinger,
  sharedCost: IconUsers,
  merchant: IconBuildingStore,
  budgetStrategy: IconAdjustments,
  importBalance: IconScale,
  dataHealth: IconStethoscope,
  recentChanges: IconHistory,
  importDatePreview: IconCalendarCheck,
  importCheck: IconChecklist,
  importMapColumns: IconAdjustments,
  importHeaderRow: IconTableRow,
  settingsNav: IconSettings,
  budgetAddCategory: IconTag,
  categoryPickerByGroup: IconTag,
  categoryPickerSuggestions: IconFilter2,
  dateQuickPicks: IconCalendarCheck,
  searchActions: IconKeyboard,
  merchantVisits: IconChartBar,
  categoryMerchants: IconBuildingStore,
  recurringCharges: IconTrendingUp,
  recurringMatchPreview: IconChartBar,
  accountsAdd: IconBuildingBank,
  addTransactionAnother: IconCirclePlus,
  correctAmountPreview: IconScale,
  receiptViewer: IconZoomIn,
  rulePreview: IconFilter,
  splitSharedCost: IconUsers,
  linkSearchOlder: IconSearch,
  financialMonthDays: IconCalendarStats,
  financialMonthExceptions: IconCalendarEvent,
  merchantsWithoutIcon: IconBuildingStore,
  categoryGroups: IconFolders,
  accountsOverdraft: IconBuildingBank,
  paymentPlan: IconCalendarDue,
  aiSettings: IconSparkles,
  aiCategories: IconSparkles,
  iconPicker: IconIcons,
  reviewTeach: IconWand,
  merchantPatterns: IconFingerprint,
  ruleTeach: IconWand,
  bankConnection: IconBuildingBank,
  importTabs: IconArrowsExchange,
  helpGuide: IconBook2,
  userInvites: IconUserPlus,
  recurringSuggestions: IconSparkles,
  recurringScan: IconRepeat,
  whatsNew: IconGift,
  backups: IconDatabase,
  updateCheck: IconRefresh,
  updateAvailable: IconDownload,
  betaBuild: IconFlask,
  betaChanges: IconGitCommit,
  aiProvider: IconServer,
  aiPicksKept: IconSparkles,
  ruleMatches: IconListCheck,
  reviewBulkRules: IconListCheck,
  iconPickerAllIcons: IconCategory2,
  notifications: IconBell,
  pushDevice: IconDeviceMobileMessage,
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
  maxHeight,
}: {
  id: TipId;
  onDismiss: () => void;
  onDismissAll: () => void;
  /** Pointer tips sit next to a control rather than across the top, so they drop the
   *  icon chip and run a size tighter — the control they point at is the icon. */
  compact?: boolean;
  /** Copy overrides for a tip whose text depends on data (the version cards); every
   *  other tip gets the `tips.<id>` copy. */
  title?: string;
  body?: string;
  /** Pointer tips pass the room left on screen; beyond it the card scrolls. */
  maxHeight?: number;
}) {
  const t = useTranslations("tips");
  const Icon = TIP_ICONS[id];

  return (
    <div
      className="pointer-events-auto overflow-y-auto overscroll-contain rounded-clear-tile border border-clear-line bg-clear-card shadow-clear-float p-4"
      style={maxHeight != null ? { maxHeight } : undefined}
    >
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

      {/* "Don't show again" turns Tips off altogether (Settings › Help). */}
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
    </div>
  );
}

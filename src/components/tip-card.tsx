"use client";

import type { ComponentType } from "react";
import { useTranslations } from "next-intl";
import {
  IconAdjustments,
  IconBuildingStore,
  IconCalendarCheck,
  IconCamera,
  IconChartBar,
  IconChecklist,
  IconFileTextFilled,
  IconHandFinger,
  IconHeartbeat,
  IconKeyboard,
  IconReload,
  IconScale,
  IconSettings,
  IconStethoscope,
  IconTrendingUp,
  IconWallet,
} from "@tabler/icons-react";

import type { TipId } from "@/lib/tips";

const TIP_ICONS: Record<TipId, ComponentType<{ className?: string }>> = {
  receiptScan: IconCamera,
  csvImport: IconFileTextFilled,
  recurring: IconReload,
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
}: {
  id: TipId;
  onDismiss: () => void;
  onDismissAll: () => void;
  /** Pointer tips sit next to a control rather than across the top, so they drop the
   *  icon chip and run a size tighter — the control they point at is the icon. */
  compact?: boolean;
}) {
  const t = useTranslations("tips");
  const Icon = TIP_ICONS[id];

  return (
    <div className="pointer-events-auto rounded-3xl bg-[var(--dialog-content-background)] shadow-floating p-4">
      <div className="flex gap-3">
        {!compact && (
          <div className="size-10 shrink-0 rounded-full bg-foreground/8 flex items-center justify-center">
            <Icon className="size-5 text-foreground/70" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-heading font-semibold text-[15px] leading-tight">{t(`${id}.title`)}</p>
          <p className="mt-1 text-sm text-foreground/60 leading-snug">{t(`${id}.body`)}</p>
        </div>
      </div>

      <div className="mt-3.5 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onDismissAll}
          className="h-9 px-3 rounded-full text-sm text-foreground/45 active:scale-[0.97] transition-transform"
        >
          {t("dontShowAgain")}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="h-9 px-5 rounded-full bg-foreground text-background text-sm font-semibold active:scale-[0.97] transition-transform"
        >
          {t("gotIt")}
        </button>
      </div>
    </div>
  );
}

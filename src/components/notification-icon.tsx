import {
  IconAlertTriangle,
  IconBuildingBank,
  IconCalendarDue,
  IconCoin,
  IconFileImport,
  IconRefreshAlert,
  IconSparkles,
  IconTrendingDown,
} from "@tabler/icons-react";
import { IconTile } from "@/components/clear/icon-tile";
import { NOTIFICATION_TONE, type NotificationKind } from "@/lib/notification-kinds";

const ICONS: Record<NotificationKind, typeof IconCoin> = {
  billDueSoon: IconCalendarDue,
  billOverdue: IconAlertTriangle,
  forecastShortfall: IconTrendingDown,
  paydayCheckIn: IconCoin,
  bankConsentExpiring: IconBuildingBank,
  bankSyncFailed: IconRefreshAlert,
  importDone: IconFileImport,
  updateAvailable: IconSparkles,
};

/** A notification kind's icon tile, in its tone (/notifications, Settings › Notifications). */
export function NotificationIcon({ kind, size = "md" }: { kind: NotificationKind; size?: "sm" | "md" }) {
  const Icon = ICONS[kind] ?? IconCoin;
  return (
    <IconTile tone={NOTIFICATION_TONE[kind] ?? "neutral"} size={size}>
      <Icon stroke={1.9} aria-hidden />
    </IconTile>
  );
}

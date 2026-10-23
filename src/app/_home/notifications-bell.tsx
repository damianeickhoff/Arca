import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { IconBell } from "@tabler/icons-react";

/** Home's phone header: a round bell that opens /notifications, with an ember dot while
 *  something is unread. The tab bar keeps its five slots, so this is how phones get there. */
export async function NotificationsBell({ unread }: { unread: number }) {
  const t = await getTranslations("nav");
  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? t("notificationsBadge", { count: unread }) : t("notifications")}
      data-tip-anchor="notificationsBell"
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-clear-card text-clear-ink no-underline transition-transform active:scale-95"
    >
      <IconBell size={22} stroke={2} aria-hidden />
      {unread > 0 && <span aria-hidden className="absolute top-2 right-2.5 size-2.5 rounded-full bg-clear-ember ring-2 ring-clear-card" />}
    </Link>
  );
}

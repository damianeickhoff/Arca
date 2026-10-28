"use client";

import { useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconClock } from "@tabler/icons-react";
import type { BankSyncStatus } from "@/lib/bank-sync-status";
import { cn } from "@/lib/utils";

/**
 * The sidebar's line under Import and the Import page's Bank connection tab dot:
 * `synced` is the moment of the last sync (drawn as a clock and a date by <SyncMoment>),
 * otherwise `text` is "Never synced" or "Consent expired, reconnect". `attention` is
 * true when the consent ran out and the line should read as a to-do.
 */
export function useBankSyncText(status: BankSyncStatus | null): { text: string; synced: string | null; attention: boolean } | null {
  const t = useTranslations("nav.bankSync");
  if (!status) return null;
  if (status.state === "expired") return { text: t("expired"), synced: null, attention: true };
  if (status.state === "never") return { text: t("never"), synced: null, attention: false };
  return { text: "", synced: status.at, attention: false };
}

const subscribeNever = () => () => {};

/**
 * "Today, 14:05", "Yesterday, 21:30", otherwise "27 Oct, 08:12", after a clock icon,
 * with "Last synced" in front for screen readers only. The date is in the browser's
 * own time zone, so it is printed only once the page runs in the browser: the server
 * would print its own zone's clock (a Docker host is usually on UTC).
 */
export function SyncMoment({ at, suffix, className }: { at: string; suffix?: string; className?: string }) {
  const t = useTranslations("nav.bankSync");
  const locale = useLocale();
  const inBrowser = useSyncExternalStore(subscribeNever, () => true, () => false);

  let when = "";
  if (inBrowser) {
    const date = new Date(at);
    // Intl directly rather than next-intl's formatter: that one carries the server's
    // time zone into the browser.
    const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
    const days = daysBetween(date, new Date());
    when = days === 0 ? t("today", { time }) : days === 1 ? t("yesterday", { time }) : t("earlier", { date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date), time });
  }

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-[5px]", className)}>
      <IconClock size={13} stroke={2.2} aria-hidden className="shrink-0" />
      <span className="truncate">
        <span className="sr-only">{t("lastSynced")} </span>
        {when}
        {suffix}
      </span>
    </span>
  );
}

/** Calendar days from `then` to `now` in the browser's time zone (0 = same day). */
function daysBetween(then: Date, now: Date) {
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

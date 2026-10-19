"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { BankSyncStatus } from "@/lib/bank-sync-status";

/**
 * "Last synced 2 hours ago", "Never synced" or "Consent expired, reconnect" — the line
 * under Import in the desktop sidebar and under the Import page's title on phones.
 * `now` comes from the server render, so the server and the browser print the same text.
 * `attention` is true when the consent ran out and the line should read as a to-do.
 */
export function useBankSyncText(status: BankSyncStatus | null, now: string): { text: string; attention: boolean } | null {
  const t = useTranslations("nav.bankSync");
  const format = useFormatter();
  if (!status) return null;
  if (status.state === "expired") return { text: t("expired"), attention: true };
  if (status.state === "never") return { text: t("never"), attention: false };
  return { text: t("synced", { time: format.relativeTime(new Date(status.at), new Date(now)) }), attention: false };
}

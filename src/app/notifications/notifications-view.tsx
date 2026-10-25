"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconChecks, IconSettings, IconTrash } from "@tabler/icons-react";
import { ClearCard } from "@/components/clear/card";
import { ClearButton } from "@/components/clear/button";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { useConfirm } from "@/components/clear/confirm-dialog";
import { MoneyText } from "@/components/clear/money";
import { NotificationIcon } from "@/components/notification-icon";
import { clearAllNotificationsAction, markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/notifications";
import type { NotificationView } from "@/lib/notification-kinds";
import { cn } from "@/lib/utils";

const SETTINGS_HREF = "/settings?panel=notifications";

/** "5 min ago", "yesterday", "3 Oct": relative to the server's render time so both renders agree. */
function useRelativeTime(nowIso: string) {
  const locale = useLocale();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const now = new Date(nowIso).getTime();
  return (iso: string) => {
    const then = new Date(iso).getTime();
    const minutes = Math.round((then - now) / 60_000);
    if (Math.abs(minutes) < 60) return rtf.format(Math.min(0, minutes), "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
    const days = Math.round(hours / 24);
    if (Math.abs(days) < 7) return rtf.format(days, "day");
    return date.format(new Date(iso));
  };
}

export function NotificationsView({
  items,
  hasMore,
  unreadCount,
  now,
}: {
  items: NotificationView[];
  hasMore: boolean;
  unreadCount: number;
  now: string;
}) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const confirm = useConfirm();
  const when = useRelativeTime(now);
  const [, startTransition] = useTransition();
  // Rows marked read here, before the revalidated page comes back.
  const [readHere, setReadHere] = useState<ReadonlySet<number>>(new Set());
  const [allReadHere, setAllReadHere] = useState(false);
  // Rows cleared here, hidden before the revalidated (empty) page comes back. By id, so a
  // notice that arrives after the clear still shows.
  const [clearedHere, setClearedHere] = useState<ReadonlySet<number>>(new Set());
  // "Older" pages, appended under the server's first page.
  const [older, setOlder] = useState<NotificationView[]>([]);
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const seen = new Set(items.map((i) => i.id));
  const list = [...items, ...older.filter((o) => !seen.has(o.id))].filter((n) => !clearedHere.has(n.id));
  const isRead = (n: NotificationView) => allReadHere || n.read || readHere.has(n.id);
  const unread = allReadHere
    ? 0
    : Math.max(0, unreadCount - items.filter((i) => !i.read && (readHere.has(i.id) || clearedHere.has(i.id))).length);
  // While a clear waits for the refreshed page, the older pages are gone too.
  const clearing = items.some((i) => clearedHere.has(i.id));
  const moreToLoad = clearing ? false : (olderHasMore ?? hasMore);

  function open(n: NotificationView) {
    if (!isRead(n)) {
      setReadHere((prev) => new Set(prev).add(n.id));
      startTransition(async () => {
        await markNotificationReadAction(n.id);
      });
    }
    if (n.href) router.push(n.href);
  }

  function markAll() {
    setAllReadHere(true);
    startTransition(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  }

  async function clearAll() {
    const ok = await confirm({ title: t("clearAllTitle"), body: t("clearAllBody"), confirmLabel: t("clearAll"), destructive: true });
    if (!ok) return;
    const ids = new Set(list.map((n) => n.id));
    setClearedHere(ids);
    startTransition(async () => {
      const res = await clearAllNotificationsAction();
      if (res.error) {
        setClearedHere(new Set());
        return;
      }
      setOlder([]);
      setOlderHasMore(null);
      router.refresh();
    });
  }

  async function loadOlder() {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch(`/api/notifications?offset=${list.length}`);
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as { items: NotificationView[]; hasMore: boolean };
      setOlder((prev) => [...prev, ...page.items]);
      setOlderHasMore(page.hasMore);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-[calc(var(--sat)+16px)] font-clear text-clear-ink lg:gap-7 lg:px-8 lg:pt-7 lg:pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.03em] lg:text-[40px]">{t("title")}</h1>
          <span className="text-base text-clear-ink-2">{t("subtitle", { count: unread })}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {list.length > 0 && (
            <ClearButton variant="surface" size="sm" onClick={markAll} disabled={unread === 0}>
              <IconChecks aria-hidden />
              {t("markAllRead")}
            </ClearButton>
          )}
          {list.length > 0 && (
            <ClearButton variant="surface" size="sm" onClick={clearAll}>
              <IconTrash aria-hidden />
              {t("clearAll")}
            </ClearButton>
          )}
          <Link href={SETTINGS_HREF} className={clearButtonVariants({ variant: "surface", size: "sm", className: "no-underline" })}>
            <IconSettings aria-hidden />
            {t("settingsLink")}
          </Link>
        </div>
      </div>

      <div className="grid gap-5">
        {list.length === 0 ? (
          <EmptyCard />
        ) : (
          <ClearCard className="gap-0 p-3 lg:p-4">
            <ul className="m-0 flex list-none flex-col p-0">
              {list.map((n) => {
                const read = isRead(n);
                return (
                  <li key={n.id} className="border-b border-clear-ground last:border-b-0">
                    <button
                      type="button"
                      onClick={() => open(n)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-clear-row px-2 py-3 text-left font-clear text-clear-ink transition-colors hover:bg-clear-tile"
                    >
                      <NotificationIcon kind={n.kind} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className={cn("truncate text-[15px]", read ? "font-semibold text-clear-ink-2" : "font-extrabold")}>
                          <MoneyText>{n.title}</MoneyText>
                        </span>
                        <span className="truncate text-[13px] text-clear-muted">
                          <MoneyText>{n.body}</MoneyText>
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="text-xs font-semibold text-clear-muted">{when(n.createdAt)}</span>
                        {!read ? (
                          <span aria-label={t("unread")} className="size-2.5 rounded-full bg-clear-ember" />
                        ) : (
                          <span aria-hidden className="size-2.5" />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {moreToLoad && (
              <div className="flex flex-col items-center gap-2 pt-3">
                <ClearButton variant="surface" size="sm" onClick={loadOlder} disabled={loading}>
                  {loading ? t("loading") : t("older")}
                </ClearButton>
                {loadFailed && <span className="text-[13px] text-clear-negative">{t("loadFailed")}</span>}
              </div>
            )}
          </ClearCard>
        )}
      </div>
    </div>
  );
}

/** Nothing yet: a bell with dashed rows waiting, one sentence and the settings. */
function EmptyCard() {
  const t = useTranslations("notifications");
  return (
    <ClearCard className="items-center justify-center gap-6 px-6 py-12 text-center">
      <svg width="260" height="200" viewBox="0 0 260 200" fill="none" aria-hidden className="h-auto w-full max-w-[260px]">
        <circle cx="130" cy="104" r="86" fill="var(--clr-butter)" />
        <rect x="62" y="96" width="136" height="30" rx="15" fill="var(--clr-card)" stroke="var(--clr-placeholder)" strokeWidth="2.2" strokeDasharray="5 4" />
        <rect x="62" y="138" width="136" height="30" rx="15" fill="var(--clr-card)" stroke="var(--clr-placeholder)" strokeWidth="2.2" strokeDasharray="5 4" />
        <path d="M108 80c0-14 10-26 22-26s22 12 22 26v6l6 8h-56l6-8z" fill="var(--clr-card)" stroke="var(--clr-ink)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M123 98a7 7 0 0 0 14 0" stroke="var(--clr-ink)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="152" cy="56" r="7" fill="var(--clr-ember)" />
        <circle cx="42" cy="140" r="6" fill="var(--clr-sky)" stroke="var(--clr-ink)" strokeWidth="2" />
      </svg>
      <p className="m-0 max-w-[480px] text-base leading-normal text-clear-ink-2">{t("empty")}</p>
      <Link href={SETTINGS_HREF} className={clearButtonVariants({ size: "lg", className: "no-underline" })}>
        {t("settingsLink")}
      </Link>
    </ClearCard>
  );
}

"use client";

import { useLocale, useTranslations } from "next-intl";
import { IconCheck } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { Amount } from "@/components/clear/amount";
import { MarkPaidButton } from "@/app/mark-paid-button";
import { cn } from "@/lib/utils";
import type { UpcomingBill } from "./upcoming-view";

/** Whole days from `today` to `date` (negative when it has passed). */
export function daysUntil(date: string, today: string) {
  return Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000);
}

/** "Sun 18 Oct · in 3 days", "1 Oct · Matched to a transaction", … and its colour. */
export function useBillMeta(today: string) {
  const t = useTranslations("upcoming.row");
  const locale = useLocale();
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });
  const short = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  return (b: UpcomingBill): { text: string; tone: string } => {
    const date = b.dueDate ? new Date(`${b.dueDate}T12:00:00`) : null;
    if (b.paid) {
      const how = b.isIncome ? t("received") : b.paidSource === "match" ? t("matched") : t("marked");
      return { text: date ? `${short.format(date)} · ${how}` : how, tone: "text-clear-muted" };
    }
    if (!b.dueDate || !date) return { text: t("noDate"), tone: "text-clear-muted" };
    if (b.overdue) return { text: t("overdue", { date: day.format(date) }), tone: "text-clear-negative" };
    const days = daysUntil(b.dueDate, today);
    const text = `${day.format(date)} · ${relative.format(days, "day")}`;
    // Due within three days: the one orange line on the list.
    return { text, tone: !b.isIncome && days >= 0 && days <= 3 ? "text-clear-ember-text" : "text-clear-muted" };
  };
}

/**
 * One bill or income line: its icon, name and when, the amount, and the paid toggle —
 * or a fixed tick when a transaction already matched it (nothing to undo there).
 */
export function BillRow({ bill: b, month, today, className }: { bill: UpcomingBill; month: string; today: string; className?: string }) {
  const t = useTranslations("upcoming.row");
  const meta = useBillMeta(today)(b);

  return (
    <li className={cn("flex min-h-[60px] items-center gap-3 border-b border-clear-ground py-2 last:border-b-0", className)}>
      <Icon iconKey={b.icon} color={b.iconColor} background={b.iconBackground} size="md" soft />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-bold">{b.name}</span>
        <span className={cn("truncate text-[13px] font-semibold", meta.tone)}>{meta.text}</span>
      </span>
      {b.amount != null && (
        <Amount
          value={b.amount}
          sign={b.isIncome ? "always" : "none"}
          splitCents={false}
          className={cn("shrink-0 text-[15px]", b.isIncome ? "text-clear-positive" : b.paid && "text-clear-ink-2")}
        />
      )}
      {b.paidSource === "match" ? (
        <span
          role="img"
          aria-label={t("paidAuto")}
          title={t("paidAuto")}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-clear-positive text-white"
        >
          <IconCheck className="size-3.5" stroke={2.4} />
        </span>
      ) : (
        <MarkPaidButton recurringItemId={b.id} month={month} paid={b.paid} />
      )}
    </li>
  );
}

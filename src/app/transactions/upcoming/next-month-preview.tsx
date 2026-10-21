"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader, ClearCardLink } from "@/components/clear/card";
import { MoneyText } from "@/components/clear/money";
import { formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PreviewRowData, UpcomingData } from "./upcoming-view";
import { useDates } from "./use-dates";

/**
 * Next month before it starts: its bills and income as two tiles, the rows that explain
 * the change (a payment plan's first part is new, a quarterly bill skips it), the rest
 * counted, and what is left after next month's bills and income. Fills its column so its
 * bottom lines up with the bills list.
 */
export function NextMonthPreview({ data }: { data: UpcomingData }) {
  const t = useTranslations("upcoming.preview");
  const { preview } = data;
  const subtitle = [
    t("summary", { amount: formatEurWhole(preview.bills), count: preview.billCount }),
    Math.round(preview.diff) !== 0
      ? preview.diff > 0
        ? t("more", { amount: formatEurWhole(preview.diff), month: data.monthName })
        : t("less", { amount: formatEurWhole(-preview.diff), month: data.monthName })
      : t("same", { month: data.monthName }),
  ].join(" · ");

  return (
    <ClearCard data-tip-anchor="upcomingNextMonth" aria-labelledby="upcoming-preview-title" className="flex-1 gap-3">
      <ClearCardHeader
        title={<span id="upcoming-preview-title" className="inline-block first-letter:uppercase">{t("title", { month: data.nextMonthName })}</span>}
        subtitle={preview.billCount > 0 ? subtitle : t("empty")}
        action={data.nav.next ? <ClearCardLink href={data.nav.next}>{t("open")}</ClearCardLink> : undefined}
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="flex min-w-0 flex-col gap-0.5 rounded-clear-tile bg-clear-tile px-3 py-2.5">
          <span className="text-xs text-clear-muted">{t("bills")}</span>
          <Amount value={preview.bills} sign="none" whole className="text-base" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 rounded-clear-tile bg-clear-mint px-3 py-2.5 text-clear-mint-ink">
          <span className="text-xs">{t("income")}</span>
          <Amount value={preview.income} sign="none" whole className="text-base" />
        </div>
      </div>

      {preview.rows.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {preview.rows.map((r) => (
            <PreviewLine key={`${r.kind}-${r.id}-${r.dueDate}`} row={r} />
          ))}
        </ul>
      )}
      {preview.more > 0 && <span className="text-xs text-clear-muted">{t("moreRows", { count: preview.more, month: data.monthName })}</span>}

      {preview.leftAfter != null && (
        <div className="mt-auto flex items-center justify-between gap-3 rounded-clear-tile bg-clear-tile px-3.5 py-3">
          <span className="text-xs text-clear-muted">{t("leftAfterLabel", { month: data.nextMonthName })}</span>
          <span className={cn("shrink-0 text-sm font-extrabold tabular-nums", preview.leftAfter < 0 && "text-clear-negative")}>
            <MoneyText>
              {preview.leftAfter >= 0
                ? t("left", { amount: formatEurWhole(preview.leftAfter) })
                : t("short", { amount: formatEurWhole(-preview.leftAfter) })}
            </MoneyText>
          </span>
        </div>
      )}
    </ClearCard>
  );
}

function PreviewLine({ row: r }: { row: PreviewRowData }) {
  const t = useTranslations("upcoming.preview");
  const tFreq = useTranslations("plan.budget.bills.frequency");
  const d = useDates();
  const skips = r.kind === "skips";
  const part = r.part != null && r.parts != null ? t("part", { part: r.part, parts: r.parts }) : null;
  const freq = r.frequency !== "monthly" && ["weekly", "four_weekly", "quarterly", "yearly"].includes(r.frequency) ? tFreq(r.frequency) : null;

  let meta: React.ReactNode;
  if (skips) {
    meta = [freq, r.nextDate ? t("nextIn", { month: d.month(r.nextDate) }) : t("ended")].filter(Boolean).join(" · ");
  } else {
    const when = r.dueDate ? d.day(r.dueDate) : t("thisMonth");
    meta =
      r.kind === "new" ? (
        <>
          <span className="font-bold text-clear-sky-ink">{part ? t("newPart", { part: r.part!, parts: r.parts! }) : t("new")}</span>
          {` · ${when}`}
        </>
      ) : (
        [when, part].filter(Boolean).join(" · ")
      );
  }

  return (
    <li className="flex min-h-11 items-center gap-3 py-1">
      <Icon iconKey={r.icon} color={r.iconColor} background={r.iconBackground} size="sm" soft />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-bold">{r.name}</span>
        <span className="truncate text-xs text-clear-muted">{meta}</span>
      </span>
      {skips ? (
        <span className="shrink-0 text-sm font-bold text-clear-muted">{t("skips")}</span>
      ) : (
        r.amount != null && <Amount value={r.amount} sign="none" splitCents={false} className="shrink-0 text-sm" />
      )}
    </li>
  );
}

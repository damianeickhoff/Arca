"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconCalendar, IconList } from "@tabler/icons-react";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { ListRow } from "@/components/clear/list-row";
import { Segmented } from "@/components/clear/segmented";
import { Icon } from "@/components/icon";
import { RecurringDetailDialog } from "@/components/settings/recurring/recurring-detail-dialog";
import { TransactionPanelSheet } from "@/app/transactions/_activity/transaction-panel-sheet";
import { formatCompactEur, formatEur } from "@/lib/format";
import { daysInclusive, shiftDate } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import type { ForecastEvent } from "@/lib/cash-flow-forecast-shared";
import type { ForecastData } from "./load-forecast";
import { MoneyText } from "@/components/clear/money";

const LIST_LENGTH = 7;
const CALENDAR_WEEKS = 5;
// Every list row is exactly 4rem (ListRow's min-h-16; title and meta truncate), so the
// first LIST_LENGTH rows have a known height. Both views get that height (at least
// MIN_ROWS rows, so a short list still leaves the calendar room) and switching between
// them never changes the card's height.
const ROW_REM = 4;
const MIN_ROWS = 6;

/**
 * What is coming: the next booked and expected payments as a list, or five weeks of
 * days as a calendar (tap a day for what moves on it). A booked transaction opens the
 * transaction sheet; an expected one opens the recurring item it comes from.
 */
export function ComingUpCard({ events, today, comingUp }: { events: ForecastEvent[]; today: string; comingUp: ForecastData["comingUp"] }) {
  const t = useTranslations("insights.forecast.comingUp");
  const locale = useLocale();
  const dateLocale = locale === "nl" ? "nl-NL" : "en-GB";
  const [view, setView] = useState<"list" | "calendar">("list");
  const [showAll, setShowAll] = useState(false);
  const [openTx, setOpenTx] = useState<number | null>(null);
  const [openItem, setOpenItem] = useState<{ id: number; date: string } | null>(null);

  const weekday = (date: string) => new Intl.DateTimeFormat(dateLocale, { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
  const days = (date: string) => daysInclusive(today, date) - 1;

  const tx = openTx != null ? (comingUp.transactions.find((r) => r.id === openTx) ?? null) : null;
  const item = openItem != null ? (comingUp.recurringItems.find((i) => i.id === openItem.id) ?? null) : null;

  function open(e: ForecastEvent) {
    if (e.transactionId != null) setOpenTx(e.transactionId);
    else if (e.recurringItemId != null) setOpenItem({ id: e.recurringItemId, date: e.date });
  }

  function row(e: ForecastEvent) {
    const soon = e.amount < 0 && days(e.date) <= 3;
    return (
      <ListRow
        key={e.key}
        icon={<Icon iconKey={e.icon} color={e.iconColor} background={e.iconBackground} size="md" soft />}
        title={e.name}
        meta={
          <span className={cn(e.amount > 0 ? "text-clear-positive" : soon && "text-clear-ember-text")}>
            {e.kind === "recurring" ? t("whenExpected", { date: weekday(e.date), days: days(e.date) }) : t("when", { date: weekday(e.date), days: days(e.date) })}
          </span>
        }
        trailing={<Amount value={e.amount} sign="always" className={cn("text-[15px]", e.amount > 0 && "text-clear-positive")} />}
        onClick={e.transactionId != null || e.recurringItemId != null ? () => open(e) : undefined}
      />
    );
  }

  const nextIncome = events.find((e) => e.amount > 0) ?? null;
  const dueBeforePayday = nextIncome ? events.filter((e) => e.amount < 0 && e.date < nextIncome.date).reduce((s, e) => s - e.amount, 0) : 0;
  const shown = showAll ? events : events.slice(0, LIST_LENGTH);
  const bodyHeight = `${Math.max(Math.min(events.length, LIST_LENGTH), MIN_ROWS) * ROW_REM}rem`;
  const hasMore = events.length > LIST_LENGTH;

  return (
    <ClearCard data-tip-anchor="insightsComingUp" aria-labelledby="forecast-coming-up-title" className="gap-3.5 lg:col-span-2 xl:col-span-1">
      <ClearCardHeader
        title={<span id="forecast-coming-up-title">{t("title")}</span>}
        action={
          <Segmented
            label={t("view")}
            surface="tile"
            size="sm"
            value={view}
            onChange={setView}
            items={[
              {
                value: "list",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <IconList size={16} stroke={2} aria-hidden />
                    {t("list")}
                  </span>
                ),
              },
              {
                value: "calendar",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <IconCalendar size={16} stroke={2} aria-hidden />
                    {t("calendar")}
                  </span>
                ),
              },
            ]}
          />
        }
      />

      {events.length === 0 ? (
        <p className="m-0 rounded-clear-tile border-2 border-dashed border-clear-line px-4 py-8 text-center text-sm text-clear-muted">{t("nothing")}</p>
      ) : view === "list" ? (
        <div className="flex flex-col" style={{ minHeight: bodyHeight }}>
          {shown.map(row)}
        </div>
      ) : (
        <CashFlowCalendar events={events} today={today} renderRow={row} height={bodyHeight} />
      )}

      {events.length > 0 && (
        // min-h-6 keeps the "Show all" line's height in the calendar view too.
        <div className={cn("mt-auto flex flex-wrap items-center justify-between gap-3 pt-1", hasMore && "min-h-6")}>
          <span className="text-sm text-clear-ink-2">
            <MoneyText>{nextIncome && dueBeforePayday > 0 ? t.rich("dueBeforePayday", { amount: formatEur(dueBeforePayday), b: (c) => <b className="text-clear-ink"><MoneyText>{c}</MoneyText></b> }) : null}</MoneyText>
          </span>
          {view === "list" && hasMore && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="cursor-pointer text-sm font-bold text-clear-ember-text hover:underline">
              {showAll ? t("showLess") : t("showAll", { count: events.length })}
            </button>
          )}
        </div>
      )}

      <TransactionPanelSheet
        row={tx}
        categories={comingUp.categories}
        savingsGoals={comingUp.savingsGoals}
        onClose={() => setOpenTx(null)}
        onCategorized={() => setOpenTx(null)}
      />
      <RecurringDetailDialog
        item={item}
        category={item?.categoryId != null ? (comingUp.categories.find((c) => c.id === item.categoryId) ?? null) : null}
        categories={comingUp.categories}
        dueDate={openItem?.date ?? null}
        onClose={() => setOpenItem(null)}
      />
    </ClearCard>
  );
}

/**
 * Five weeks from this Monday: each day tinted by the money moving on it. Fills the
 * given height: the day cells grow or shrink with it and the selected day's payments
 * scroll inside their own area.
 */
function CashFlowCalendar({
  events,
  today,
  renderRow,
  height,
}: {
  events: ForecastEvent[];
  today: string;
  renderRow: (e: ForecastEvent) => React.ReactNode;
  height: string;
}) {
  const t = useTranslations("insights.forecast.comingUp");
  const locale = useLocale();
  const dateLocale = locale === "nl" ? "nl-NL" : "en-GB";

  const byDate = new Map<string, ForecastEvent[]>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const [selected, setSelected] = useState<string>(() => events[0]?.date ?? today);

  const lead = (new Date(`${today}T12:00:00`).getDay() + 6) % 7;
  const start = shiftDate(today, -lead);
  const dates = Array.from({ length: CALENDAR_WEEKS * 7 }, (_, i) => shiftDate(start, i));
  const weekdays = [1, 2, 3, 4, 5, 6, 7].map((d) => new Intl.DateTimeFormat(dateLocale, { weekday: "narrow" }).format(new Date(2024, 0, d)));
  const longDate = (date: string) => new Intl.DateTimeFormat(dateLocale, { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));
  const net = (date: string) => (byDate.get(date) ?? []).reduce((s, e) => s + e.amount, 0);
  const selectedEvents = byDate.get(selected) ?? [];

  return (
    <div className="flex flex-col gap-3" style={{ height }}>
      <div
        role="group"
        aria-label={t("calendarLabel")}
        className="grid min-h-0 flex-1 grid-cols-7 gap-1.5"
        style={{ gridTemplateRows: `auto repeat(${CALENDAR_WEEKS}, minmax(0, 1fr))` }}
      >
        {weekdays.map((d, i) => (
          <span key={i} aria-hidden className="text-center text-xs font-semibold text-clear-muted">
            {d}
          </span>
        ))}
        {dates.map((date) => {
          const amount = net(date);
          const past = date < today;
          const isSelected = date === selected;
          const day = Number(date.slice(8, 10));
          return (
            <button
              key={date}
              type="button"
              disabled={past}
              onClick={() => setSelected(date)}
              aria-pressed={isSelected}
              aria-label={amount !== 0 ? t("dayLabel", { date: longDate(date), amount: `${amount < 0 ? "−" : "+"}${formatEur(Math.abs(amount))}` }) : longDate(date)}
              className={cn(
                "flex min-h-0 min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 overflow-hidden rounded-clear-icon text-[13px] font-bold tabular-nums transition-colors disabled:cursor-default",
                past
                  ? "text-clear-placeholder"
                  : isSelected
                    ? "bg-clear-primary text-clear-primary-ink"
                    : amount > 0
                      ? "bg-clear-mint text-clear-mint-ink"
                      : amount < 0
                        ? "bg-clear-peach text-clear-peach-ink"
                        : "bg-clear-tile text-clear-ink hover:bg-clear-line",
                date === today && !isSelected && "ring-2 ring-clear-ink ring-inset",
              )}
            >
              {day}
              {amount !== 0 && !past && <span className="hidden text-xs font-semibold sm:inline"><MoneyText>{formatCompactEur(Math.abs(amount))}</MoneyText></span>}
            </button>
          );
        })}
      </div>
      <div className="flex max-h-[40%] shrink-0 flex-col overflow-y-auto">
        <span className="pb-1 text-sm font-bold capitalize">{longDate(selected)}</span>
        {selectedEvents.length === 0 ? <p className="m-0 py-3 text-sm text-clear-muted">{t("dayEmpty")}</p> : selectedEvents.map(renderRow)}
      </div>
    </div>
  );
}

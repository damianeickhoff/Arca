"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconCheck, IconChevronDown, IconX } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { Amount } from "@/components/clear/amount";
import { ClearCard } from "@/components/clear/card";
import { MoneyText } from "@/components/clear/money";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { BillStatusControl } from "@/components/bill-status-control";
import { billControl, billsTotal, foldSummary } from "@/lib/bill-groups";
import { groupUpcomingBills } from "@/lib/upcoming-plan";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UpcomingBill, UpcomingData } from "./upcoming-view";
import { daysBetween, useDates } from "./use-dates";

const FREQUENCIES = new Set(["daily", "weekly", "four_weekly", "quarterly", "yearly"]);

/**
 * Still due: what is left to pay this month, under Overdue, This week and Later this
 * month, each with its total (expenses only), income on its day as a mint row, then
 * everything paid, received and skipped folded into one row that opens in place. With
 * nothing left to pay it shows a drawing and the next bill. A day picked on the
 * calendar narrows the list to that day.
 */
export function StillDueCard({
  data,
  day,
  onClearDay,
  className,
}: {
  data: UpcomingData;
  day: string | null;
  onClearDay: () => void;
  className?: string;
}) {
  const t = useTranslations("upcoming.list");
  const d = useDates();
  const [doneOpen, setDoneOpen] = useState(false);
  const { groups, done } = groupUpcomingBills(data.bills, data.today, data.from, data.to);
  const counted = data.bills.filter((b) => !b.skipped);
  const open = counted.filter((b) => !b.isIncome && !b.paid);
  const received = counted.filter((b) => b.isIncome && b.paid);
  const fold = foldSummary(done.filter((b) => !b.skipped));
  const receivedTotal = received.reduce((s, b) => s + (b.amount ?? 0), 0);
  const skippedCount = done.filter((b) => b.skipped).length;
  const allPaid = !day && groups.length === 0;

  const dayBills = day ? data.bills.filter((b) => b.dueDate === day) : null;
  // The tip points at the first row that shows a status control.
  const firstShown = (dayBills ?? groups.flatMap((g) => g.items))[0] ?? (doneOpen ? done[0] : undefined);

  const row = (b: UpcomingBill) => <BillLine key={`${b.id}-${b.dueDate}`} bill={b} data={data} tipAnchor={b === firstShown} />;

  return (
    <ClearCard aria-labelledby="upcoming-due-title" className={cn("gap-1 px-4 pt-5 pb-3.5 lg:px-5 lg:pt-6 lg:pb-4", className)}>
      <div className="flex items-baseline justify-between gap-3 px-1 pb-1.5">
        <h2 id="upcoming-due-title" className="m-0 text-lg font-bold">{t("title")}</h2>
        <span className="text-[15px] font-extrabold tabular-nums">
          <MoneyText>{formatEur(billsTotal(open))}</MoneyText>
        </span>
      </div>

      {dayBills ? (
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-1">
            <span className="text-[13px] font-bold text-clear-muted first-letter:uppercase">
              <MoneyText>{t("dayHeading", { date: d.long(day!), amount: formatEur(billsTotal(dayBills)) })}</MoneyText>
            </span>
            <button type="button" onClick={onClearDay} className={clearButtonVariants({ variant: "ghost", size: "sm" })}>
              <IconX aria-hidden />
              {t("allDays")}
            </button>
          </div>
          {dayBills.length === 0 ? (
            <p className="m-0 px-1 py-2 text-sm text-clear-muted">{t("dayEmpty")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">{dayBills.map(row)}</ul>
          )}
        </div>
      ) : allPaid ? (
        <AllPaid data={data} />
      ) : (
        groups.map((g) => (
          <div key={g.key} className="flex flex-col">
            <div className={cn("flex items-center justify-between px-1 pt-2.5 pb-0.5 text-[13px] font-bold", g.key === "overdue" ? "text-clear-ember-text" : "text-clear-muted")}>
              <span>{t(`groups.${g.key}`)}</span>
              {g.total > 0 && <span className="tabular-nums"><MoneyText>{formatEur(g.total)}</MoneyText></span>}
            </div>
            <ul className="m-0 flex list-none flex-col p-0">{g.items.map(row)}</ul>
          </div>
        ))
      )}

      {!dayBills && done.length > 0 && (
        <div className="mt-2 flex flex-col">
          <button
            type="button"
            aria-expanded={doneOpen}
            onClick={() => setDoneOpen((v) => !v)}
            className="flex cursor-pointer items-center gap-3 rounded-clear-tile bg-clear-tile px-3.5 py-3 text-left transition-colors hover:bg-clear-line"
          >
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-clear-mint text-clear-mint-ink">
              <IconCheck size={16} stroke={2.6} aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-bold">
                <MoneyText>
                  {[
                    fold.count > 0 ? t("foldPaid", { count: fold.count, amount: formatEur(fold.total) }) : null,
                    skippedCount > 0 ? t("foldSkipped", { count: skippedCount }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </MoneyText>
                {received.length > 0 && (
                  <span className="text-clear-positive">
                    <MoneyText>{`${fold.count + skippedCount > 0 ? " · " : ""}${t("foldIncome", { count: received.length, amount: formatEur(receivedTotal) })}`}</MoneyText>
                  </span>
                )}
              </span>
              {fold.names.length > 0 && (
                <span className="truncate text-[13px] text-clear-muted">
                  {fold.more > 0 ? t("foldNamesMore", { names: fold.names.join(", "), count: fold.more }) : fold.names.join(", ")}
                </span>
              )}
            </span>
            <IconChevronDown size={16} stroke={2.2} aria-hidden className={cn("shrink-0 transition-transform", doneOpen && "rotate-180")} />
          </button>
          {doneOpen && <ul className="m-0 flex list-none flex-col p-0 pt-1">{done.map(row)}</ul>}
        </div>
      )}
    </ClearCard>
  );
}

/** Nothing left to pay: a calendar with a tick, the sentence, and the next bill when there is one. */
function AllPaid({ data }: { data: UpcomingData }) {
  const t = useTranslations("upcoming.list");
  const d = useDates();
  const next = data.nextUp;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3.5 px-3 py-6 text-center">
      <svg width="148" height="120" viewBox="0 0 148 120" aria-hidden>
        <circle cx="22" cy="28" r="7" fill="var(--clr-butter)" />
        <circle cx="128" cy="20" r="5" fill="var(--clr-peach)" />
        <circle cx="134" cy="88" r="8" fill="var(--clr-sky)" />
        <rect x="34" y="18" width="80" height="88" rx="16" fill="var(--clr-tile)" />
        <rect x="34" y="18" width="80" height="24" rx="12" fill="var(--clr-ink)" />
        <rect x="34" y="30" width="80" height="12" fill="var(--clr-ink)" />
        <rect x="52" y="10" width="8" height="18" rx="4" fill="var(--clr-ink-2)" />
        <rect x="88" y="10" width="8" height="18" rx="4" fill="var(--clr-ink-2)" />
        <circle cx="74" cy="74" r="22" fill="var(--clr-mint)" />
        <path d="M63 74l8 8 15-16" fill="none" stroke="var(--clr-mint-ink)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[17px] font-extrabold">{t("allDone", { month: data.monthName })}</span>
      {next && (
        <span className="text-sm text-clear-muted">
          <MoneyText>
            {next.amount != null
              ? t("nextUp", { name: next.name, date: d.short(next.date), amount: formatEur(next.amount) })
              : t("nextUpNoAmount", { name: next.name, date: d.short(next.date) })}
          </MoneyText>
        </span>
      )}
    </div>
  );
}

/** One bill or income line: icon, name (a plan's part as a chip), when, and on the
 *  right the amount over its status control (with Skip for a savings transfer). */
function BillLine({ bill: b, data, tipAnchor }: { bill: UpcomingBill; data: UpcomingData; tipAnchor: boolean }) {
  const t = useTranslations("upcoming.list");
  const tFreq = useTranslations("plan.budget.bills.frequency");
  const d = useDates();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function skip(on: boolean) {
    setBusy(true);
    await fetch("/api/recurring/skips", {
      method: on ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recurringItemId: b.id, month: data.month }),
    }).catch(() => null);
    router.refresh();
    setBusy(false);
  }

  // When: the date, then what it is ("debt payment", "quarterly", "no match pattern").
  const parts: string[] = [];
  let tone = "text-clear-muted";
  if (b.dueDate) parts.push(d.day(b.dueDate));
  else parts.push(t("thisMonth"));
  const days = b.dueDate ? daysBetween(data.today, b.dueDate) : null;
  if (b.skipped) parts.push(t("skippedNote", { month: data.monthName }));
  else if (b.paid) parts.push(b.isIncome ? t("received") : b.paidSource === "match" ? t("matched") : t("marked"));
  else if (b.overdue && days != null) {
    parts.push(t("overdueDays", { count: -days }));
    if (b.hasPattern) parts.push(t("noPayment"));
    tone = "text-clear-negative";
  } else if (days != null && data.period === "current" && days >= 0) {
    if (b.isIncome) parts.push(t("payday"));
    parts.push(d.relative(days));
    if (!b.isIncome && days <= 2) tone = "text-clear-ember-text";
    if (b.isIncome) tone = "text-clear-positive";
  }
  if (!b.paid && !b.skipped) {
    if (b.type === "debt") parts.push(t("debt"));
    else if (b.type === "savings") parts.push(t("savings"));
    if (b.frequency !== "monthly" && FREQUENCIES.has(b.frequency)) parts.push(tFreq(b.frequency));
    if (!b.hasPattern) parts.push(t("noPattern"));
    if (b.part != null && b.endDate) parts.push(t("ends", { month: d.month(b.endDate) }));
  }

  const canSkip = b.skippable && !b.paid && data.period !== "past";
  const control = billControl(b, data.today);

  return (
    <li
      className={cn(
        "flex min-h-[62px] items-center gap-3 px-1 py-1.5",
        b.isIncome && !b.paid && "my-0.5 rounded-clear-row bg-clear-mint px-2.5",
        b.skipped && "opacity-60",
      )}
    >
      <Icon iconKey={b.icon} color={b.iconColor} background={b.iconBackground} size="md" soft />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px] font-bold">{b.name}</span>
          {b.part != null && b.parts != null && (
            <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-clear-sky px-2 text-xs font-bold text-clear-sky-ink">
              {t("part", { part: b.part, parts: b.parts })}
            </span>
          )}
        </span>
        <span className={cn("line-clamp-2 text-[13px] font-semibold", tone)}>{parts.join(" · ")}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {b.amount != null && (
          <Amount
            value={b.amount}
            sign={b.isIncome ? "always" : "none"}
            splitCents={false}
            className={cn("text-[15px]", b.isIncome ? "text-clear-positive" : (b.paid || b.skipped) && "text-clear-ink-2", b.skipped && "line-through")}
          />
        )}
        <span className="flex items-center gap-1.5">
          {canSkip && (
            <button
              type="button"
              disabled={busy}
              onClick={() => skip(!b.skipped)}
              className={cn(clearButtonVariants({ variant: "outline", size: "sm" }), "h-7 border-clear-line px-3 text-xs text-clear-ink-2")}
            >
              <span className="inline-block first-letter:uppercase">{b.skipped ? t("undoSkip") : t("skip", { month: data.monthName })}</span>
            </button>
          )}
          {!b.skipped && (
            <BillStatusControl
              state={control}
              recurringItemId={b.id}
              month={data.month}
              item={b.item}
              income={b.isIncome}
              onIncomeRow={b.isIncome && !b.paid}
              tipAnchor={tipAnchor}
            />
          )}
        </span>
      </span>
    </li>
  );
}

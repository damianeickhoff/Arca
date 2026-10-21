"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconChevronDown, IconX } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { ClearProgress } from "@/components/clear/progress";
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
 * The month's one list: Overdue, This week and Later this month, each with its total
 * (expenses only), income on its day as a mint row, then everything paid, received and
 * skipped folded into one row that opens in place. A day picked on the month grid
 * narrows the list to that day.
 */
export function BillsListCard({
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
  const out = counted.filter((b) => !b.isIncome);
  const open = out.filter((b) => !b.paid);
  const paid = out.filter((b) => b.paid);
  const received = counted.filter((b) => b.isIncome && b.paid);
  const income = counted.filter((b) => b.isIncome);
  const paidTotal = billsTotal(paid);
  const total = billsTotal(out);
  const fold = foldSummary(done.filter((b) => !b.skipped));
  const receivedTotal = received.reduce((s, b) => s + (b.amount ?? 0), 0);
  const skippedCount = done.filter((b) => b.skipped).length;

  const dayBills = day ? data.bills.filter((b) => b.dueDate === day) : null;
  // The tip points at the first row that shows a status control.
  const firstShown = (dayBills ?? groups.flatMap((g) => g.items))[0] ?? (doneOpen ? done[0] : undefined);

  const subtitle = [
    t("toPay", { count: open.length, amount: formatEur(billsTotal(open)) }),
    paid.length > 0 ? t("paidCount", { count: paid.length }) : null,
    income.length > 0 ? t("incomeCount", { count: income.length }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const row = (b: UpcomingBill) => <BillLine key={`${b.id}-${b.dueDate}`} bill={b} data={data} tipAnchor={b === firstShown} />;

  return (
    <ClearCard aria-labelledby="upcoming-list-title" className={cn("gap-3", className)}>
      <ClearCardHeader title={<span id="upcoming-list-title">{t("title", { month: data.monthName })}</span>} subtitle={subtitle} />

      {total > 0 && (
        <div className="flex flex-col gap-1.5">
          <ClearProgress size="sm" value={paidTotal / total} hatchRemainder fillClassName="bg-clear-primary" />
          <div className="flex justify-between gap-3 text-xs tabular-nums text-clear-muted">
            <span><MoneyText>{t("paidAmount", { amount: formatEur(paidTotal) })}</MoneyText></span>
            <span><MoneyText>{t("totalAmount", { amount: formatEur(total) })}</MoneyText></span>
          </div>
        </div>
      )}

      {dayBills ? (
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-3 pt-2 pb-1">
            <span className="text-xs font-bold text-clear-muted first-letter:uppercase">
              <MoneyText>{t("dayHeading", { date: d.long(day!), amount: formatEur(billsTotal(dayBills)) })}</MoneyText>
            </span>
            <button type="button" onClick={onClearDay} className={clearButtonVariants({ variant: "ghost", size: "sm" })}>
              <IconX aria-hidden />
              {t("allDays")}
            </button>
          </div>
          {dayBills.length === 0 ? (
            <p className="m-0 py-2 text-sm text-clear-muted">{t("dayEmpty")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">{dayBills.map(row)}</ul>
          )}
        </div>
      ) : (
        <>
          {groups.length === 0 && <p className="m-0 text-sm text-clear-muted">{t("allDone", { month: data.monthName })}</p>}
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col">
              <div className={cn("flex items-center justify-between pt-2 pb-1 text-xs font-bold", g.key === "overdue" ? "text-clear-ember-text" : "text-clear-muted")}>
                <span>{t(`groups.${g.key}`)}</span>
                {g.total > 0 && <span className="tabular-nums"><MoneyText>{formatEur(g.total)}</MoneyText></span>}
              </div>
              <ul className="m-0 flex list-none flex-col p-0">{g.items.map(row)}</ul>
            </div>
          ))}

          {done.length > 0 && (
            <div className="flex flex-col">
              <button
                type="button"
                aria-expanded={doneOpen}
                onClick={() => setDoneOpen((v) => !v)}
                className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-clear-tile bg-clear-tile px-3.5 py-2.5 text-left transition-colors hover:bg-clear-line"
              >
                <span className="text-[13px] font-bold">
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
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-clear-muted">
                  <span className="truncate">
                    {fold.more > 0 ? t("foldNamesMore", { names: fold.names.join(", "), count: fold.more }) : fold.names.join(", ")}
                  </span>
                  <IconChevronDown size={14} stroke={2.2} aria-hidden className={cn("shrink-0 transition-transform", doneOpen && "rotate-180")} />
                </span>
              </button>
              {doneOpen && <ul className="m-0 flex list-none flex-col p-0 pt-1">{done.map(row)}</ul>}
            </div>
          )}
        </>
      )}
    </ClearCard>
  );
}

/** One bill or income line: icon, name (a plan's part as a chip), when, the amount, a
 *  Skip action for a savings transfer and the status control. */
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
        "flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1 py-1.5 sm:flex-nowrap",
        b.isIncome && !b.paid && "-mx-2.5 my-0.5 rounded-clear-row bg-clear-mint px-2.5",
        b.skipped && "opacity-60",
      )}
    >
      <Icon iconKey={b.icon} color={b.iconColor} background={b.iconBackground} size="md" soft />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-bold">{b.name}</span>
          {b.part != null && b.parts != null && (
            <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-clear-sky px-2 text-xs font-bold text-clear-sky-ink">
              {t("part", { part: b.part, parts: b.parts })}
            </span>
          )}
        </span>
        <span className={cn("truncate text-xs font-semibold", tone)}>{parts.join(" · ")}</span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {canSkip && (
          <button
            type="button"
            disabled={busy}
            data-tip-anchor="billSkip"
            onClick={() => skip(!b.skipped)}
            className={cn(clearButtonVariants({ variant: "outline", size: "sm" }), "h-7 border-clear-line px-3 text-xs text-clear-ink-2")}
          >
            <span className="inline-block first-letter:uppercase">{b.skipped ? t("undoSkip") : t("skip", { month: data.monthName })}</span>
          </button>
        )}
        {b.amount != null && (
          <Amount
            value={b.amount}
            sign={b.isIncome ? "always" : "none"}
            splitCents={false}
            className={cn("text-sm", b.isIncome ? "text-clear-positive" : (b.paid || b.skipped) && "text-clear-ink-2", b.skipped && "line-through")}
          />
        )}
        <span className="flex min-w-[68px] justify-end">
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

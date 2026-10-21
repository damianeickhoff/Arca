"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { IconCalendarDue, IconCheck, IconInfoCircle, IconPlus, IconRepeat, IconTrendingUp } from "@tabler/icons-react";
import { Amount } from "@/components/clear/amount";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { StatTile } from "@/components/clear/stat-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { MoneyText } from "@/components/clear/money";
import { AnchoredTip } from "@/components/anchored-tip";
import { billsDueTotal } from "@/lib/bill-amounts";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SubpageHeading } from "../subpage-heading";
import { BillsCalendar } from "./bills-calendar";
import { BillRow, daysUntil } from "./bill-row";
import { AddRecurringButton } from "@/components/settings/recurring/add-recurring-button";
import { RecurringSuggestions } from "@/components/settings/recurring/recurring-suggestions";
import type { SuggestionView } from "@/lib/recurring-suggestions";

export interface UpcomingBill {
  id: number;
  name: string;
  amount: number | null;
  icon: string | null;
  iconColor: string | null;
  iconBackground: string | null;
  /** YYYY-MM-DD; null for items without a fixed day this month. */
  dueDate: string | null;
  paid: boolean;
  paidSource: "match" | "manual" | null;
  overdue: boolean;
  /** Money coming in: on the calendar and in its own list, never in a "still to pay" total. */
  isIncome: boolean;
}

export interface UpcomingData {
  month: string;
  /** "October" — the month the financial month ends in. */
  monthName: string;
  /** "October 2026". */
  monthLabel: string;
  from: string;
  to: string;
  today: string;
  isCurrent: boolean;
  /** Links for the month arrows and "Today"; null when there is nowhere to go. */
  nav: { prev: string | null; next: string | null; today: string | null };
  /** Soonest first, date-less ones last. */
  bills: UpcomingBill[];
  /** Regular payments the detector found, waiting for Accept / Not a bill. */
  suggestions: SuggestionView[];
}

const sum = (list: UpcomingBill[]) => list.reduce((s, b) => s + (b.amount ?? 0), 0);

/**
 * Activity › Upcoming. One grid: the three summary tiles (still due in ember, paid,
 * income expected), then the calendar with the explainer under it (two columns wide)
 * beside the Still due, Paid and Income lists. Phones stack it all in that order.
 */
export function UpcomingView({ data }: { data: UpcomingData }) {
  const t = useTranslations("upcoming");
  const locale = useLocale();
  const short = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const long = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "short" });
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const out = data.bills.filter((b) => !b.isIncome);
  const due = out.filter((b) => !b.paid);
  const paid = out.filter((b) => b.paid);
  const income = data.bills.filter((b) => b.isIncome);
  const incomeExpected = income.filter((b) => !b.paid);
  const dueTotal = billsDueTotal(due);
  const paidTotal = sum(paid);
  const fixedTotal = dueTotal + paidTotal;
  const next = due.find((b) => b.dueDate != null && b.dueDate >= data.today);
  const nextIncome = incomeExpected.find((b) => b.dueDate != null && b.dueDate >= data.today) ?? incomeExpected[0];
  const empty = data.bills.length === 0;

  const subtitle = empty
    ? t("subtitleNone")
    : due.length > 0
      ? t("subtitle", { month: data.monthName, amount: formatEur(dueTotal) })
      : t("subtitleAllPaid", { month: data.monthName });

  return (
    <div className="flex flex-col gap-5 px-4 pt-[calc(var(--sat)+16px)] font-clear text-clear-ink lg:gap-7 lg:px-8 lg:pt-7 lg:pb-12">
      <SubpageHeading
        parentHref="/transactions"
        parentLabel={t("parent")}
        breadcrumbLabel={t("breadcrumb")}
        title={t("title")}
        subtitle={subtitle}
        actions={
          <>
            <Link href="/settings?panel=recurring" className={cn(clearButtonVariants({ variant: "surface" }), "hidden lg:inline-flex")}>
              <IconRepeat aria-hidden />
              {t("recurringItems")}
            </Link>
            <AddRecurringButton type="bill" ariaLabel={t("addBill")} className={cn(clearButtonVariants({ size: "icon" }), "size-12 lg:hidden")}>
              <IconPlus aria-hidden />
            </AddRecurringButton>
            <AddRecurringButton type="bill" className={cn(clearButtonVariants(), "hidden lg:inline-flex")}>
              <IconPlus aria-hidden />
              {t("addBill")}
            </AddRecurringButton>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <RecurringSuggestions suggestions={data.suggestions} className="lg:col-span-2 xl:col-span-3" />
        {empty ? (
          <EmptyCard />
        ) : (
          <>
            <StatTile
              highlight
              className="rounded-clear-card p-[22px]"
              label={t("tiles.due")}
              icon={<IconCalendarDue stroke={2} />}
              value={<Amount value={dueTotal} className="text-[30px] lg:text-[34px]" />}
              foot={
                due.length === 0
                  ? t("tiles.dueNone")
                  : next
                    ? t("tiles.dueNext", { count: due.length, name: next.name, date: short.format(new Date(`${next.dueDate}T12:00:00`)) })
                    : t("tiles.dueCount", { count: due.length })
              }
            />
            <StatTile
              className="rounded-clear-card bg-clear-card p-[22px]"
              label={t("tiles.paid")}
              icon={
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-clear-mint text-clear-mint-ink">
                  <IconCheck stroke={2.4} />
                </span>
              }
              value={<Amount value={paidTotal} className="text-[30px] lg:text-[34px]" />}
              foot={
                paid.length === 0
                  ? t("tiles.paidNone")
                  : t("tiles.paidCount", { count: paid.length, pct: fixedTotal > 0 ? Math.round((paidTotal / fixedTotal) * 100) : 100 })
              }
            />
            <StatTile
              className="rounded-clear-card bg-clear-card p-[22px] lg:col-span-2 xl:col-span-1"
              label={t("tiles.income")}
              icon={
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-clear-tile">
                  <IconTrendingUp stroke={2} />
                </span>
              }
              value={<Amount value={sum(incomeExpected)} className="text-[30px] text-clear-positive lg:text-[34px]" />}
              foot={
                nextIncome
                  ? t("tiles.incomeNext", {
                      name: nextIncome.name,
                      date: nextIncome.dueDate
                        ? data.isCurrent && nextIncome.dueDate >= data.today
                          ? `${long.format(new Date(`${nextIncome.dueDate}T12:00:00`))}, ${relative.format(daysUntil(nextIncome.dueDate, data.today), "day")}`
                          : long.format(new Date(`${nextIncome.dueDate}T12:00:00`))
                        : t("row.noDate"),
                    })
                  : income.length > 0
                    ? t("tiles.incomeReceived")
                    : t("tiles.incomeNone")
              }
            />
          </>
        )}

        {/* The calendar with the explainer under it, two columns wide. */}
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-2">
          <BillsCalendar data={data} />
          <section aria-labelledby="upcoming-info-title" className="flex items-start gap-3.5 rounded-clear-card bg-clear-sky px-6 py-5 text-clear-ink">
            <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-clear-card text-clear-sky-ink">
              <IconInfoCircle size={20} stroke={2} />
            </span>
            <div className="flex flex-col gap-1">
              <h2 id="upcoming-info-title" className="m-0 text-base font-bold">{t("info.title")}</h2>
              <p className="m-0 text-sm leading-normal text-clear-sky-ink">{t("info.body")}</p>
            </div>
          </section>
        </div>

        {/* Still due, Paid and Income: one column from xl, side by side at lg. */}
        {!empty && (
          <div className="flex min-w-0 flex-col gap-5 lg:col-span-2 lg:grid lg:grid-cols-2 lg:items-start xl:col-span-1 xl:flex">
            <ClearCard aria-labelledby="upcoming-due-title" className="gap-2.5">
              <ClearCardHeader
                title={<span id="upcoming-due-title">{t("due.title")}</span>}
                action={<span className="text-[15px] font-extrabold tabular-nums"><MoneyText>{formatEur(dueTotal)}</MoneyText></span>}
              />
              {due.length === 0 ? (
                <p className="m-0 text-sm text-clear-muted">{t("due.empty", { month: data.monthName })}</p>
              ) : (
                <ul className="m-0 flex list-none flex-col p-0">
                  {due.map((b) => (
                    <BillRow key={b.id} bill={b} month={data.month} today={data.today} />
                  ))}
                </ul>
              )}
            </ClearCard>

            <ClearCard aria-labelledby="upcoming-paid-title" className="gap-2.5">
              <ClearCardHeader
                title={<span id="upcoming-paid-title">{t("paid.title")}</span>}
                action={<span className="text-[15px] font-extrabold tabular-nums"><MoneyText>{formatEur(paidTotal)}</MoneyText></span>}
              />
              {paid.length === 0 ? (
                <p className="m-0 text-sm text-clear-muted">{t("paid.empty")}</p>
              ) : (
                <ul className="m-0 flex list-none flex-col p-0">
                  {paid.map((b) => (
                    <BillRow key={b.id} bill={b} month={data.month} today={data.today} />
                  ))}
                </ul>
              )}
            </ClearCard>

            {income.length > 0 && (
              <ClearCard aria-labelledby="upcoming-income-title" className="gap-2.5">
                <ClearCardHeader title={<span id="upcoming-income-title">{t("income.title")}</span>} />
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {income.map((b) => (
                    <BillRow key={b.id} bill={b} month={data.month} today={data.today} className="rounded-clear-tile border-b-0 bg-clear-tile px-3" />
                  ))}
                </ul>
              </ClearCard>
            )}
          </div>
        )}
      </div>

      {/* The month arrows are new: earlier months show what was paid, later ones what's coming. */}
      <AnchoredTip id="upcomingMonthNav" anchor="upcomingMonthNav" active={!empty} />
    </div>
  );
}

/** No bills or income at all: a simple calendar shape, one sentence and Add a bill. */
function EmptyCard() {
  const t = useTranslations("upcoming.empty");
  return (
    <ClearCard aria-labelledby="upcoming-empty-title" className="items-center justify-center gap-6 px-6 py-12 text-center lg:col-span-2 xl:col-span-3">
      <svg width="260" height="200" viewBox="0 0 260 200" fill="none" aria-hidden className="h-auto w-full max-w-[260px]">
        <circle cx="130" cy="104" r="86" fill="var(--clr-peach)" />
        <rect x="58" y="46" width="144" height="124" rx="18" fill="var(--clr-card)" stroke="var(--clr-ink)" strokeWidth="2.5" />
        <path d="M58 82h144" stroke="var(--clr-ink)" strokeWidth="2.5" />
        <path d="M92 34v24M168 34v24" stroke="var(--clr-ink)" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="76" y="98" width="28" height="24" rx="7" fill="var(--clr-mint)" stroke="var(--clr-ink)" strokeWidth="2" />
        <rect x="116" y="98" width="28" height="24" rx="7" fill="var(--clr-card)" stroke="var(--clr-placeholder)" strokeWidth="2" strokeDasharray="4 3" />
        <rect x="156" y="98" width="28" height="24" rx="7" fill="var(--clr-card)" stroke="var(--clr-placeholder)" strokeWidth="2" strokeDasharray="4 3" />
        <rect x="76" y="132" width="28" height="24" rx="7" fill="var(--clr-card)" stroke="var(--clr-placeholder)" strokeWidth="2" strokeDasharray="4 3" />
        <rect x="116" y="132" width="28" height="24" rx="7" fill="var(--clr-ember)" stroke="var(--clr-ink)" strokeWidth="2" />
        <circle cx="222" cy="52" r="6" fill="var(--clr-ember)" />
        <circle cx="40" cy="132" r="5" fill="var(--clr-butter)" stroke="var(--clr-ink)" strokeWidth="2" />
      </svg>
      <div className="flex flex-col items-center gap-2.5">
        <h2 id="upcoming-empty-title" className="m-0 text-2xl font-extrabold tracking-[-0.02em]">{t("title")}</h2>
        <p className="m-0 max-w-[480px] text-base leading-normal text-clear-ink-2">{t("body")}</p>
      </div>
      <AddRecurringButton type="bill" className={clearButtonVariants({ size: "lg" })}>
        <IconPlus aria-hidden />
        {t("add")}
      </AddRecurringButton>
    </ClearCard>
  );
}

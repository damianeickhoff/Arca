"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconPlus, IconRepeat } from "@tabler/icons-react";
import type { RecurringItem } from "@/db/schema";
import { ClearCard } from "@/components/clear/card";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { PageTour } from "@/components/page-tour";
import { AddRecurringButton } from "@/components/settings/recurring/add-recurring-button";
import { MigrationReview, RecurringSuggestions } from "@/components/settings/recurring/recurring-suggestions";
import type { SuggestionView } from "@/lib/recurring-suggestions";
import type { BalancePoint } from "@/lib/upcoming-plan";
import { billsTotal } from "@/lib/bill-groups";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SubpageHeading } from "../subpage-heading";
import { UpcomingHero } from "./upcoming-hero";
import { BalanceCard } from "./balance-card";
import { BillsCalendar } from "./bills-calendar";
import { StillDueCard } from "./still-due";
import { NextMonthPreview } from "./next-month-preview";

export interface UpcomingBill {
  id: number;
  name: string;
  amount: number | null;
  icon: string | null;
  iconColor: string | null;
  iconBackground: string | null;
  /** YYYY-MM-DD; null for an item without a due day ("This month"). */
  dueDate: string | null;
  type: string;
  frequency: string;
  paid: boolean;
  paidSource: "match" | "manual" | null;
  hasPattern: boolean;
  /** The item, for "Teach Arca the pattern"; only set when it has no pattern. */
  item: RecurringItem | null;
  overdue: boolean;
  /** Money coming in: a mint row in the list, never in a "to pay" total. */
  isIncome: boolean;
  /** "Skip October": out of every total this month. */
  skipped: boolean;
  /** A savings transfer: its month can be skipped. */
  skippable: boolean;
  /** A payment plan's part on this date, and how many parts it has. */
  part: number | null;
  parts: number | null;
  endDate: string | null;
}

export interface PreviewRowData {
  kind: "new" | "same" | "skips";
  id: number;
  name: string;
  amount: number | null;
  icon: string | null;
  iconColor: string | null;
  iconBackground: string | null;
  dueDate: string | null;
  frequency: string;
  part: number | null;
  parts: number | null;
  /** For a bill that skips next month: when it is due again (null when it isn't). */
  nextDate: string | null;
}

export interface UpcomingData {
  month: string;
  nextMonth: string;
  /** "October": the month the financial month ends in. */
  monthName: string;
  nextMonthName: string;
  /** "October 2026". */
  monthLabel: string;
  from: string;
  to: string;
  today: string;
  period: "past" | "current" | "future";
  /** Links for the month arrows and "Today"; null when there is nowhere to go. */
  nav: { prev: string | null; next: string | null; today: string | null };
  /** Soonest first, one without a due day last. Skipped ones included. */
  bills: UpcomingBill[];
  /** What still leaves the account up to the day before payday. */
  payday: { amount: number; count: number; until: string };
  nextIncome: { name: string; amount: number | null; date: string; days: number } | null;
  /** Next month's first bill still to pay, for Still due once everything is paid. */
  nextUp: { name: string; amount: number | null; date: string } | null;
  /** The checking accounts; balance null until one has a starting balance. Null for a month still to come. */
  account: { name: string | null; count: number; balance: number | null } | null;
  /** The running balance; null without a known balance or for a month still to come. */
  series: { past: BalancePoint[]; future: BalancePoint[]; lowest: BalancePoint | null; end: number } | null;
  preview: {
    rows: PreviewRowData[];
    more: number;
    bills: number;
    billCount: number;
    income: number;
    /** Next month's bills minus this month's. */
    diff: number;
    /** What is left after next month's bills and income; null without a known balance. */
    leftAfter: number | null;
  };
  /** Regular payments the detector found, waiting for Accept / Not a bill. */
  suggestions: SuggestionView[];
  /** Earlier auto-detected bills that failed the new tests, waiting for Keep / Remove. */
  migration: SuggestionView[];
}

/**
 * Activity › Upcoming. One grid: the black hero (what still leaves before payday) beside
 * the running balance (two wide); the month calendar (two wide, with the month arrows)
 * beside Still due and next month's preview, which fills the column to the calendar's
 * bottom. Phones: hero, calendar, Still due, preview, running balance.
 */
export function UpcomingView({ data }: { data: UpcomingData }) {
  const t = useTranslations("upcoming");
  const [day, setDay] = useState<string | null>(null);
  const empty = data.bills.length === 0;
  const open = data.bills.filter((b) => !b.isIncome && !b.paid && !b.skipped);
  const dueTotal = billsTotal(open);

  const subtitle = empty
    ? t("subtitleNone")
    : [
        open.length > 0 ? t("subtitle", { month: data.monthName, amount: formatEur(dueTotal) }) : t("subtitleAllPaid", { month: data.monthName }),
        data.nextIncome ? t("subtitlePayday", { days: data.nextIncome.days }) : null,
      ]
        .filter(Boolean)
        .join(" · ");

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
        <MigrationReview items={data.migration} className="lg:col-span-2 xl:col-span-3" />
        <RecurringSuggestions suggestions={data.suggestions} className="lg:col-span-2 xl:col-span-3" />
        {empty ? (
          <EmptyCard />
        ) : (
          <>
            <UpcomingHero data={data} />
            {data.period !== "future" && <BalanceCard data={data} className="order-last lg:order-none xl:col-span-2" />}
            <BillsCalendar data={data} day={day} onDay={(d) => setDay((cur) => (cur === d ? null : d))} className="lg:col-span-2" />
            <div className="flex min-w-0 flex-col gap-5 lg:col-span-2 lg:grid lg:grid-cols-2 xl:col-span-1 xl:flex">
              <StillDueCard data={data} day={day} onClearDay={() => setDay(null)} />
              <NextMonthPreview data={data} />
            </div>
          </>
        )}
      </div>

      <PageTour id="upcoming" ready={!empty} />
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

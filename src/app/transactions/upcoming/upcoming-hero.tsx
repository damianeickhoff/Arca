"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Amount } from "@/components/clear/amount";
import { ClearCard } from "@/components/clear/card";
import { MoneyText } from "@/components/clear/money";
import { billsTotal } from "@/lib/bill-groups";
import { formatEur } from "@/lib/format";
import { paydayBar } from "@/lib/upcoming-plan";
import type { UpcomingData } from "./upcoming-view";
import { cn } from "@/lib/utils";
import { useDates } from "./use-dates";

const pct = (n: number) => `${Math.max(0, Math.min(100, n * 100))}%`;
/** The hero's hatch: half-strength hero-ink stripes on a clear gap, so the track shows through. */
const HERO_HATCH =
  "repeating-linear-gradient(135deg, color-mix(in srgb, var(--clr-hero-ink) 55%, transparent) 0 3px, transparent 3px 6px)";

/**
 * The answer card. The month in progress: what still has to leave the account before
 * payday (overdue plus everything due until the day before the next income), the
 * checking balance now and after those bills, and the next income with the days to go.
 * Another month: what its bills come to.
 */
export function UpcomingHero({ data }: { data: UpcomingData }) {
  const t = useTranslations("upcoming.hero");
  const d = useDates();

  if (data.period !== "current") {
    const out = data.bills.filter((b) => !b.isIncome && !b.skipped);
    const paid = out.filter((b) => b.paid);
    const income = data.bills.filter((b) => b.isIncome && !b.skipped);
    return (
      <ClearCard hero aria-labelledby="upcoming-hero-title" className="gap-1.5">
        <h2 id="upcoming-hero-title" className="m-0 text-[13px] font-semibold text-clear-hero-ink-2 first-letter:uppercase">
          {t("monthTitle", { month: data.monthName })}
        </h2>
        <Amount value={billsTotal(out)} sign="none" className="text-[34px] tracking-[-0.02em]" />
        <span className="text-[13px] text-clear-hero-ink-2">
          <MoneyText>
            {data.period === "past"
              ? t("pastSub", { paid: paid.length, open: out.length - paid.length })
              : t("futureSub", { count: out.length, amount: formatEur(income.reduce((s, b) => s + (b.amount ?? 0), 0)) })}
          </MoneyText>
        </span>
      </ClearCard>
    );
  }

  const balance = data.account?.balance ?? null;
  const left = balance != null ? balance - data.payday.amount : null;
  const income = data.nextIncome;
  const accountName = data.account?.name ?? t("accounts", { count: data.account?.count ?? 0 });
  const bar = paydayBar(data.bills, data.payday.amount);

  return (
    <ClearCard hero aria-labelledby="upcoming-hero-title" className="gap-0">
      <h2 id="upcoming-hero-title" className="m-0 text-[13px] font-semibold text-clear-hero-ink-2">
        {income && income.date <= data.to ? t("title") : t("titleMonth")}
      </h2>
      <Amount value={data.payday.amount} sign="none" className="mt-1.5 text-[34px] tracking-[-0.02em]" />
      <span className="mt-1 text-[13px] text-clear-hero-ink-2">
        {data.payday.count === 0 ? t("none") : t("count", { count: data.payday.count, date: d.day(data.payday.until) })}
      </span>

      {bar && (
        // Solid: this month's bills already paid. Hatched: what still leaves before payday.
        <div aria-hidden className="mt-3.5 flex h-2 overflow-hidden rounded-full bg-clear-hero-ink/14">
          <span className="h-full bg-clear-hero-ink" style={{ width: pct(bar.paid) }} />
          <span className="h-full" style={{ width: pct(bar.toLeave), backgroundImage: HERO_HATCH }} />
        </div>
      )}

      {balance != null && left != null ? (
        <div className={cn("flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs text-clear-hero-ink-2", bar ? "mt-1.5" : "mt-3.5")}>
          <span className={left < 0 ? "font-bold text-clear-ember" : undefined}>
            <MoneyText>{left >= 0 ? t("leftAfter", { amount: formatEur(left) }) : t("shortBy", { amount: formatEur(-left) })}</MoneyText>
          </span>
          <span><MoneyText>{t("inAccount", { amount: formatEur(balance), name: accountName })}</MoneyText></span>
        </div>
      ) : (
        <Link
          href="/settings?panel=accounts"
          className={cn("text-xs font-bold text-clear-hero-ink-2 underline-offset-2 hover:underline", bar ? "mt-1.5" : "mt-3.5")}
        >
          {t("setBalance")}
        </Link>
      )}

      <div className="mt-auto pt-3.5">
        <div className="flex items-center justify-between gap-2.5 rounded-clear-tile bg-clear-hero-ink/8 px-3.5 py-3">
          {income ? (
            <>
              <div className="flex min-w-0 flex-col">
                <span className="text-xs font-semibold text-clear-hero-ink-2">{t("nextIncome")}</span>
                <span className="truncate text-sm font-semibold">{income.name}</span>
                <span className="text-xs text-clear-hero-ink-2">
                  {d.day(income.date)}
                  {income.amount != null && (
                    <>
                      {" · "}
                      <Amount value={income.amount} sign="always" splitCents={false} className="text-clear-hero-ink" />
                    </>
                  )}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className="clear-amount text-2xl leading-none">{income.days}</span>
                <span className="text-xs text-clear-hero-ink-2">{t("daysLeft", { count: income.days })}</span>
              </div>
            </>
          ) : (
            <span className="text-[13px] text-clear-hero-ink-2">{t("noIncome")}</span>
          )}
        </div>
      </div>
    </ClearCard>
  );
}

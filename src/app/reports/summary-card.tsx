"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { MoneyText } from "@/components/clear/money";
import { summarizePeriodAction } from "@/app/actions/ai";
import { balanceOf, type PeriodSummary, type SummaryFacts } from "@/lib/period-facts";
import { formatEur, formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";

const strong = (chunks: React.ReactNode) => <b className="font-bold">{chunks}</b>;

/** "2 hours ago": how long ago a summary was written, in the reader's language. */
function writtenAgo(createdAt: string, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const minutes = Math.max(1, Math.round((Date.now() - new Date(createdAt).getTime()) / 60_000));
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

/**
 * Insights › Overview's summary: a headline, three facts and a budgeting tip. With AI on
 * Gemini writes them (only when asked, free-tier quota, kept until rewritten) from the
 * figures this page shows (`facts`); before that, and with AI off, the card shows the
 * same facts as the app computes them, without any prose. Either way the card has one
 * shape that fills its height: the facts take the free space, the tip and the footer
 * line ("Written 2 hours ago · Rewrite", or the way to Settings › AI) sit at the bottom.
 */
export function SummaryCard({
  facts,
  aiReady,
  cacheKey,
  initial,
  subtitle,
  className,
}: {
  facts: SummaryFacts;
  aiReady: boolean;
  /** The period and filters this summary belongs to. */
  cacheKey: string;
  initial: PeriodSummary | null;
  /** The period and the days left in it. */
  subtitle: string;
  className?: string;
}) {
  const t = useTranslations("insights.summary");
  const locale = useLocale();
  const [summary, setSummary] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Switching period re-renders this with another key: show what was kept for that one.
  const [prevKey, setPrevKey] = useState(cacheKey);
  if (cacheKey !== prevKey) {
    setPrevKey(cacheKey);
    setSummary(initial);
    setError(null);
  }

  async function write() {
    setBusy(true);
    setError(null);
    const result = await summarizePeriodAction(cacheKey, facts).catch(() => ({ error: "unavailable" as const }));
    setBusy(false);
    if ("summary" in result) setSummary(result.summary);
    else setError(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.unavailable"));
  }

  const written = aiReady && summary ? summary : null;
  const action = "cursor-pointer text-[13px] font-semibold text-clear-ember-text no-underline hover:underline disabled:cursor-default disabled:opacity-60";

  return (
    <ClearCard aria-labelledby="summary-title" data-tip-anchor="insightsSummary" className={cn("gap-3.5", className)}>
      <ClearCardHeader
        title={<span id="summary-title">{t("title")}</span>}
        subtitle={subtitle}
        action={aiReady ? <ClearChip tone="lilac" className="h-6 px-2.5 text-xs font-semibold">{t("aiChip")}</ClearChip> : undefined}
      />

      {written ? (
        <>
          <p className="m-0 text-base leading-snug font-semibold text-pretty">
            <MoneyText>{written.headline}</MoneyText>
          </p>
          <FactList items={written.facts.map((f) => <MoneyText key={f}>{f}</MoneyText>)} />
          <p className="m-0 rounded-clear-tile bg-clear-butter px-3.5 py-3 text-sm leading-snug font-medium text-clear-butter-ink">
            <MoneyText>{written.tip}</MoneyText>
          </p>
        </>
      ) : (
        <ComputedFacts facts={facts} />
      )}

      {error && <p role="alert" className="m-0 text-[13px] font-semibold text-clear-negative">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-clear-muted">
        <span suppressHydrationWarning>{written ? t("written", { time: writtenAgo(written.createdAt, locale) }) : aiReady ? t("footAi") : t("footComputed")}</span>
        {aiReady ? (
          <button type="button" onClick={write} disabled={busy} className={action}>
            {busy ? t("writing") : written ? t("rewrite") : t("write")}
          </button>
        ) : (
          <Link href="/settings?panel=ai" className={action}>
            {t("switchOn")}
          </Link>
        )}
      </div>
    </ClearCard>
  );
}

/** Three numbered rows; amounts in them stand out in bold ink. */
function FactList({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="m-0 flex flex-1 list-none flex-col gap-2 p-0">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-snug text-clear-ink-2 [&_.money-swap]:font-bold [&_.money-swap]:whitespace-nowrap [&_.money-swap]:text-clear-ink [&_b]:text-clear-ink">
          <span aria-hidden className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-clear-tile text-xs font-bold text-clear-ink">
            {i + 1}
          </span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ol>
  );
}

/** The facts as the app computes them: no AI, no prose beyond the sentence templates. */
function ComputedFacts({ facts }: { facts: SummaryFacts }) {
  const t = useTranslations("insights.summary");
  const balance = balanceOf(facts.income, facts.expense);

  const biggest =
    facts.biggestGroup && facts.topMerchant
      ? t.rich("biggest", {
          group: facts.biggestGroup.name,
          groupAmount: formatEur(facts.biggestGroup.spent),
          merchant: facts.topMerchant.name,
          merchantAmount: formatEur(facts.topMerchant.total),
          b: strong,
        })
      : facts.biggestGroup
        ? t.rich("biggestGroup", { group: facts.biggestGroup.name, amount: formatEur(facts.biggestGroup.spent), b: strong })
        : facts.topMerchant
          ? t.rich("topMerchant", { merchant: facts.topMerchant.name, amount: formatEur(facts.topMerchant.total), b: strong })
          : t("nothingSpent");

  const items = [
    t.rich(`balance.${balance.kind}`, { amount: formatEur(balance.amount), b: strong }),
    biggest,
    facts.other.transactions > 0
      ? t.rich("other", { amount: formatEur(facts.other.amount), count: facts.other.transactions, b: strong })
      : t("otherNone"),
  ].map((item, i) => <MoneyText key={i}>{item}</MoneyText>);

  const left = facts.left;
  return (
    <>
      <FactList items={items} />
      <p className="m-0 rounded-clear-tile bg-clear-mint px-3.5 py-3 text-sm leading-snug font-medium text-clear-mint-ink">
        <MoneyText>
          {left
            ? left.amount > 0
              ? t.rich("left", { amount: formatEur(left.amount), perDay: formatEurWhole(left.perDay), count: left.daysLeft, b: strong })
              : t.rich("overBudget", { amount: formatEur(-left.amount), count: left.daysLeft, b: strong })
            : t.rich("perDay", { amount: formatEurWhole(facts.avgPerDay), b: strong })}
          {facts.prevAvgPerDay != null && <> {t("prevPerDay", { amount: formatEurWhole(facts.prevAvgPerDay) })}</>}
        </MoneyText>
      </p>
    </>
  );
}

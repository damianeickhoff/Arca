"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { IconActivity, IconRefresh, IconSparkles } from "@tabler/icons-react";
import { ClearCard } from "@/components/clear/card";
import { IconTile } from "@/components/clear/icon-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { MoneyText } from "@/components/clear/money";
import { summarizePeriodAction } from "@/app/actions/ai";
import { balanceOf, type PeriodSummary, type SummaryFacts } from "@/lib/period-facts";
import { formatEur, formatEurWhole } from "@/lib/format";
import { cn } from "@/lib/utils";

const strong = (chunks: React.ReactNode) => <b className="font-extrabold">{chunks}</b>;

/**
 * Insights › Overview's summary: a headline, three facts and a budgeting tip. With AI on
 * Gemini writes them (only when asked, free-tier quota, kept until rewritten) from the
 * figures this page shows (`facts`); before that, and with AI off, the card shows the
 * same facts as the app computes them, without any prose.
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
  const writtenAt = written
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(written.createdAt))
    : null;

  return (
    <ClearCard aria-labelledby="summary-title" data-tip-anchor="insightsSummary" className={cn("gap-3.5", className)}>
      <div className="flex items-center gap-2.5">
        <IconTile tone={aiReady ? "lilac" : "stone"} size="sm">
          {aiReady ? <IconSparkles stroke={2} /> : <IconActivity stroke={2} />}
        </IconTile>
        <div className="flex min-w-0 flex-col">
          <h2 id="summary-title" className="m-0 text-lg font-bold">
            {aiReady ? t("title") : facts.ongoing ? t("titleOngoing") : t("titleDone")}
          </h2>
          <span className="text-xs text-clear-muted">{writtenAt ? t("written", { date: writtenAt }) : subtitle}</span>
        </div>
      </div>

      {written ? (
        <>
          <p className="m-0 text-base leading-snug font-bold text-pretty">
            <MoneyText>{written.headline}</MoneyText>
          </p>
          <FactList items={written.facts.map((f) => <MoneyText key={f}>{f}</MoneyText>)} />
          <p className="m-0 rounded-clear-tile bg-clear-butter px-3.5 py-3 text-sm leading-snug font-semibold text-clear-butter-ink">
            <MoneyText>{written.tip}</MoneyText>
          </p>
        </>
      ) : (
        <ComputedFacts facts={facts} />
      )}

      {error && <p role="alert" className="m-0 text-[13px] font-semibold text-clear-negative">{error}</p>}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-clear-muted">
        <span>{aiReady ? t("footAi") : t("footComputed")}</span>
        {aiReady ? (
          <button type="button" onClick={write} disabled={busy} className={clearButtonVariants({ variant: written ? "secondary" : "primary", size: "sm" })}>
            {written ? <IconRefresh aria-hidden /> : <IconSparkles aria-hidden />}
            {busy ? t("writing") : written ? t("rewrite") : t("write")}
          </button>
        ) : (
          <Link href="/settings?panel=ai" className="font-bold text-clear-ember-text no-underline hover:underline">
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
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-snug text-clear-ink-2 [&_.money-swap]:font-extrabold [&_.money-swap]:whitespace-nowrap [&_.money-swap]:text-clear-ink [&_b]:text-clear-ink">
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
      <p className="m-0 rounded-clear-tile bg-clear-mint px-3.5 py-3 text-sm leading-snug font-semibold text-clear-mint-ink">
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

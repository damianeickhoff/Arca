"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconRefresh, IconSparkles } from "@tabler/icons-react";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { IconTile } from "@/components/clear/icon-tile";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { MoneyText } from "@/components/clear/money";
import { summarizePeriodAction } from "@/app/actions/ai";
import type { PeriodSummary, SummaryFacts } from "@/lib/ai-features";
import { cn } from "@/lib/utils";

/**
 * Insights › Overview: a few sentences from Gemini about the period on screen, written
 * only when asked (free-tier quota) and kept until rewritten. Its only input is the
 * figures this page already shows (`facts`), never individual transactions.
 */
export function AiSummaryCard({
  facts,
  cacheKey,
  initial,
  className,
}: {
  facts: SummaryFacts;
  /** The period and filters this summary belongs to. */
  cacheKey: string;
  initial: PeriodSummary | null;
  className?: string;
}) {
  const t = useTranslations("insights.aiSummary");
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

  const written = summary
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(summary.createdAt))
    : null;

  return (
    <ClearCard aria-labelledby="ai-summary-title" data-tip-anchor="aiSummary" className={cn("gap-3.5", className)}>
      <ClearCardHeader
        title={
          <span id="ai-summary-title" className="inline-flex items-center gap-2.5">
            <IconTile tone="lilac" size="sm"><IconSparkles stroke={2} /></IconTile>
            {t("title")}
          </span>
        }
        subtitle={written ? t("written", { date: written }) : t("subtitle")}
        action={
          <button type="button" onClick={write} disabled={busy} className={clearButtonVariants({ variant: summary ? "secondary" : "primary", size: "sm" })}>
            {summary ? <IconRefresh aria-hidden /> : <IconSparkles aria-hidden />}
            {busy ? t("writing") : summary ? t("rewrite") : t("write")}
          </button>
        }
      />
      {summary ? (
        <p className="m-0 text-[15px] leading-relaxed text-clear-ink"><MoneyText>{summary.text}</MoneyText></p>
      ) : (
        <p className="m-0 rounded-clear-tile border-2 border-dashed border-clear-line px-4 py-4 text-[15px] text-clear-muted">{t("empty")}</p>
      )}
      {error && <p role="alert" className="m-0 text-[13px] font-semibold text-clear-negative">{error}</p>}
    </ClearCard>
  );
}

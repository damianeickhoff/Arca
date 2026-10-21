"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconSparkles } from "@tabler/icons-react";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { ClearChip } from "@/components/clear/chip";
import { IconTile } from "@/components/clear/icon-tile";
import { MoneyText } from "@/components/clear/money";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { ContextualTip } from "@/components/contextual-tip";
import { Icon } from "@/components/icon";
import { RecurringClient } from "@/components/settings/recurring/recurring-client";
import { acceptSuggestionAction, linkSuggestionAction, rejectSuggestionAction } from "@/app/actions/recurring-suggestions";
import { confidenceLevel, type ConfidenceLevel } from "@/lib/recurring-detect/score";
import type { SuggestionView } from "@/lib/recurring-suggestions";
import type { ClearTone } from "@/components/clear/tones";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";

const CONFIDENCE_TONE: Record<ConfidenceLevel, ClearTone> = { high: "mint", medium: "sky", low: "butter" };

/** "€34,99 every month around the 22nd, 6 times since April". */
function useSuggestionLine() {
  const t = useTranslations("recurringSuggestions");
  const locale = useLocale();
  const thisYear = new Date().getFullYear();
  return (s: SuggestionView) => {
    const sign = s.type === "income" ? "+" : "";
    const amount =
      s.amountMin != null && s.amountMax != null
        ? t("range", { min: formatEur(s.amountMin), max: formatEur(s.amountMax) })
        : `${sign}${formatEur(s.amount ?? 0)}`;
    const rhythm =
      s.frequency === "monthly" && s.dueDay != null
        ? t("rhythm.monthlyOn", { day: s.dueDay })
        : t(`rhythm.${s.frequency}` as "rhythm.monthly");
    const first = s.firstDate ? new Date(`${s.firstDate}T12:00:00`) : null;
    const since = first
      ? new Intl.DateTimeFormat(locale, first.getFullYear() === thisYear ? { month: "long" } : { month: "short", year: "numeric" }).format(first)
      : null;
    return since
      ? t("line", { amount, rhythm, count: s.occurrences, since })
      : t("lineNoDate", { amount, rhythm, count: s.occurrences });
  };
}

/**
 * The review strip: "Arca found 4 regular payments", one row per suggestion with
 * Accept / Edit / Not a bill. Shown on Upcoming and in Settings › Recurring; renders
 * nothing when there is nothing to review.
 */
export function RecurringSuggestions({ suggestions, className }: { suggestions: SuggestionView[]; className?: string }) {
  const t = useTranslations("recurringSuggestions");
  const line = useSuggestionLine();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<SuggestionView | null>(null);
  const [error, setError] = useState(false);

  const visible = suggestions.filter((s) => !hidden.has(s.id));
  if (visible.length === 0 && !editing) return null;

  function act(id: number, action: () => Promise<{ error?: string }>) {
    setBusyId(id);
    setError(false);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if (result.error) setError(true);
      else setHidden((h) => new Set(h).add(id));
    });
  }

  return (
    <ClearCard className={className} aria-labelledby="recurring-suggestions-title">
      <ContextualTip id="recurringSuggestions" />
      <div className="flex items-start gap-3">
        <IconTile tone="lilac" className="size-11 shrink-0"><IconSparkles aria-hidden /></IconTile>
        <ClearCardHeader
          className="min-w-0 flex-1"
          title={<span id="recurring-suggestions-title">{t("title", { count: visible.length })}</span>}
          subtitle={t("subtitle")}
        />
      </div>

      <ul className="m-0 flex list-none flex-col p-0">
        {visible.map((s) => {
          const level = confidenceLevel(s.confidence);
          const busy = pending && busyId === s.id;
          return (
            <li key={s.id} className="flex flex-col gap-3 border-b border-clear-ground py-3 last:border-b-0 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Icon iconKey={s.icon} color={s.iconColor} background={s.iconBackground} size="md" soft />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[15px] font-bold">{s.name}</span>
                    <ClearChip tone={CONFIDENCE_TONE[level]} className="h-6 px-2.5 text-xs">{t(`confidence.${level}`)}</ClearChip>
                  </span>
                  <span className="truncate text-[13px] text-clear-muted"><MoneyText>{line(s)}</MoneyText></span>
                </span>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 pl-[52px] sm:pl-0">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(s.id, () => acceptSuggestionAction(s.id))}
                  className={clearButtonVariants({ size: "sm" })}
                >
                  {t("accept")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(s)}
                  className={clearButtonVariants({ variant: "secondary", size: "sm" })}
                >
                  {t("edit")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(s.id, () => rejectSuggestionAction(s.id))}
                  className={clearButtonVariants({ variant: "ghost", size: "sm" })}
                >
                  {t("reject")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className={cn("m-0 text-[13px] font-semibold text-clear-negative")}>{t("error")}</p>}

      {editing && (
        <RecurringClient
          action="add"
          open
          title={t("editTitle")}
          prefill={{
            name: editing.name,
            type: editing.type,
            amount: String(editing.amount ?? ""),
            budgetType: editing.budgetType ?? undefined,
            startDate: editing.startDate ?? undefined,
            frequency: editing.frequency,
            matchPattern: editing.matchPattern,
            matchAmount: editing.matchAmount != null ? String(editing.matchAmount) : undefined,
            matchAmountMin: editing.matchAmountMin != null ? String(editing.matchAmountMin) : undefined,
            matchAmountMax: editing.matchAmountMax != null ? String(editing.matchAmountMax) : undefined,
          }}
          onSaved={(item) => {
            const id = editing.id;
            act(id, () => linkSuggestionAction(id, item.id));
          }}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      )}
    </ClearCard>
  );
}

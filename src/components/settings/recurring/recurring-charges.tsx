"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import { formatEur } from "@/lib/format";
import { isValidISODate } from "@/lib/date-valid";
import { cn } from "@/lib/utils";
import type { TransactionDetail } from "@/app/transactions/transaction-types";
import type { TipAnchor } from "@/lib/tip-placement";
import { MoneyText, SvgMoneyText } from "@/components/clear/money";

/** A transaction linked to a recurring item: the full TransactionDetail shape (so a
 *  row can open the transaction sheet) plus the account fields the lists show. */
export type LinkedTx = TransactionDetail & {
  account: string | null;
  bankName: string | null;
};

/** The transactions linked to one recurring item, newest first; null while loading. */
export function useLinkedTransactions(itemId: number | null) {
  const [loaded, setLoaded] = useState<{ id: number; rows: LinkedTx[] } | null>(null);
  useEffect(() => {
    if (itemId == null) return;
    let cancelled = false;
    fetch(`/api/recurring/transactions?itemId=${itemId}`)
      .then((r) => r.json())
      .then((rows: LinkedTx[]) => { if (!cancelled) setLoaded({ id: itemId, rows: Array.isArray(rows) ? rows : [] }); })
      .catch(() => { if (!cancelled) setLoaded({ id: itemId, rows: [] }); });
    return () => { cancelled = true; };
  }, [itemId]);
  return loaded && loaded.id === itemId ? loaded.rows : null;
}

/** All the chart needs of a charge — linked transactions and preview matches alike. */
export type Charge = Pick<LinkedTx, "date" | "amount" | "correctedAmount">;

const chargeOf = (t: Charge) => Math.abs(t.correctedAmount ?? t.amount);

/** What an unsaved recurring item would match: its pattern and amount rule. */
export interface MatchCriteria {
  pattern: string;
  wholeWord: boolean;
  amount: number | null;
  min: number | null;
  max: number | null;
}

/** The preview's answer: how many past transactions match, and the latest charges. */
export interface MatchPreview {
  total: number;
  rows: Charge[];
}

/**
 * The past transactions `criteria` would match, from /api/recurring/preview — for the
 * editor's chart while the item is not saved yet (or its rule is being changed).
 * Debounced while typing; null while there is nothing to ask or the first answer is
 * pending. The previous answer stays up while a new one loads so the chart doesn't blink.
 */
export function useMatchPreview(criteria: MatchCriteria | null) {
  const pattern = criteria?.pattern.trim() ?? "";
  const query = criteria && pattern
    ? new URLSearchParams({
        pattern,
        wholeWord: criteria.wholeWord ? "1" : "0",
        ...(criteria.amount != null ? { amount: String(criteria.amount) } : {}),
        ...(criteria.min != null ? { min: String(criteria.min) } : {}),
        ...(criteria.max != null ? { max: String(criteria.max) } : {}),
      }).toString()
    : null;
  const [loaded, setLoaded] = useState<{ query: string; preview: MatchPreview } | null>(null);
  useEffect(() => {
    if (query == null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/recurring/preview?${query}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: MatchPreview | null) => {
          if (!cancelled) setLoaded({ query, preview: d && Array.isArray(d.rows) ? d : { total: 0, rows: [] } });
        })
        .catch(() => { /* keep the last answer */ });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);
  if (query == null || !loaded) return null;
  return loaded.preview;
}

/**
 * "Last 12 charges" (Popup-Recurring): the latest charges as bars, oldest left, with
 * the total and average, and — when the price changed — the change called out with
 * the bars since then in ember and the latest one in ink.
 */
export function RecurringCharges({ txs, tipAnchor = "recurringCharges" }: { txs: Charge[]; tipAnchor?: TipAnchor }) {
  const t = useTranslations("recurringDetail.charges");
  const locale = useLocale();
  const charges = txs
    .filter((x) => isValidISODate(x.date))
    .slice(0, 12)
    .reverse()
    .map((x) => ({ date: x.date, value: chargeOf(x) }));
  if (charges.length < 2) return null;

  const cents = charges.map((c) => Math.round(c.value * 100));
  const latest = cents[cents.length - 1];
  // The most recent change: walk back while the price is the current one.
  let since = cents.length - 1;
  while (since > 0 && cents[since - 1] === latest) since--;
  const change = since > 0 ? { from: charges[since - 1].value, to: charges[since].value, date: charges[since].date, index: since } : null;

  const total = charges.reduce((s, c) => s + c.value, 0);
  const avg = total / charges.length;
  const monthly = new Set(charges.map((c) => c.date.slice(0, 7))).size === charges.length;
  const month = new Intl.DateTimeFormat(locale, { month: "short" });
  const dayMonth = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const monthLong = new Intl.DateTimeFormat(locale, { month: "long" });
  const label = (d: string) => (monthly ? month : dayMonth).format(new Date(`${d}T12:00:00`));

  const w = 480;
  const base = 88;
  const top = 24;
  const max = Math.max(...charges.map((c) => c.value), 0.01);
  const min = Math.min(...charges.map((c) => c.value));
  // Zoom in on the range when the charges barely differ, so a price step is visible.
  const lo = min === max ? 0 : Math.max(0, min - (max - min) * 1.5);
  const slot = w / charges.length;
  const bw = Math.min(22, slot * 0.55);
  const h = (v: number) => Math.max(6, ((v - lo) / (max - lo || 1)) * (base - top));
  const up = change ? change.to > change.from : false;
  const changedFill = up ? "var(--clr-ember)" : "var(--clr-positive-fill)";
  // Labels for every bar when they fit (monthly), else only the ends and the change.
  const showLabel = (i: number) => monthly || i === 0 || i === charges.length - 1 || i === change?.index;

  const spoken = charges.map((c) => `${label(c.date)} ${formatEur(c.value)}`).join(", ");

  return (
    <div data-tip-anchor={tipAnchor} className="flex flex-col gap-3 rounded-clear-tile bg-clear-tile px-4 py-4 sm:px-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-[15px] font-bold">{t("title", { count: charges.length })}</span>
        <span className="text-[13px] font-semibold text-clear-ink-2">
          <MoneyText>{t.rich("summary", {
            total: formatEur(total),
            avg: formatEur(avg),
            b: (chunks) => <b className="font-extrabold tabular-nums text-clear-ink"><MoneyText>{chunks}</MoneyText></b>,
          })}</MoneyText>
        </span>
      </div>
      <svg viewBox={`0 0 ${w} 112`} role="img" aria-label={t("aria", { list: spoken })} className="block h-auto w-full">
        <line x1={0} y1={base} x2={w} y2={base} stroke="var(--clr-line)" />
        {charges.map((c, i) => {
          const x = i * slot + (slot - bw) / 2;
          const hh = h(c.value);
          const isLast = i === charges.length - 1;
          const fill = isLast ? "var(--clr-ink)" : change && i >= change.index ? changedFill : "var(--clr-placeholder)";
          return (
            <g key={`${c.date}-${i}`}>
              <rect x={x} y={base - hh} width={bw} height={hh} rx={6} fill={fill} fillOpacity={!change && !isLast ? 0.45 : 1} />
              {showLabel(i) && (
                <text
                  x={x + bw / 2}
                  y={106}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={isLast || i === change?.index ? 700 : 400}
                  fill={isLast || i === change?.index ? "var(--clr-ink)" : "var(--clr-muted)"}
                >
                  {label(c.date)}
                </text>
              )}
            </g>
          );
        })}
        {change && (
          <text x={Math.min(w - 60, change.index * slot + (slot - bw) / 2)} y={Math.max(14, base - h(change.to) - 8)} fontSize={12} fontWeight={700} fill={up ? "var(--clr-ember-text)" : "var(--clr-positive)"}>
            <SvgMoneyText>{formatEur(change.to)}</SvgMoneyText>
          </text>
        )}
      </svg>
      {change && (
        <div className={cn("flex flex-wrap items-center gap-2.5 rounded-clear-icon px-3 py-2.5", up ? "bg-clear-peach" : "bg-clear-mint")}>
          <span aria-hidden className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-clear-card", up ? "text-clear-ember-text" : "text-clear-positive")}>
            {up ? <IconTrendingUp size={16} stroke={2.2} /> : <IconTrendingDown size={16} stroke={2.2} />}
          </span>
          <span className="text-sm font-bold">
            <MoneyText>{t(up ? "priceUp" : "priceDown", { amount: formatEur(Math.abs(change.to - change.from)), month: monthLong.format(new Date(`${change.date}T12:00:00`)) })}</MoneyText>
          </span>
          <span className="ml-auto text-[13px] font-semibold tabular-nums text-clear-ink-2">
            <MoneyText>{formatEur(change.from)}</MoneyText> → <MoneyText>{formatEur(change.to)}</MoneyText>
          </span>
        </div>
      )}
    </div>
  );
}

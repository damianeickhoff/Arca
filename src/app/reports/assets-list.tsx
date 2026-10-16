"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Amount } from "@/components/clear/amount";
import { ClearChip } from "@/components/clear/chip";
import { Segmented } from "@/components/clear/segmented";
import { cn } from "@/lib/utils";

export type AssetKind = "cash" | "investments" | "things";
export type AssetSource = "synced" | "entered" | "plan" | "debts";

export interface AssetItem {
  key: string;
  /** Server-rendered icon (the item's own soft icon or its kind's glyph). */
  icon: React.ReactNode;
  name: string;
  /** Where the figure comes from and when, already translated. */
  meta: string;
  value: number;
  kind: AssetKind;
  source: AssetSource;
  /** A value you entered yourself that is getting old: offers "Update value". */
  stale?: boolean;
  href?: string;
  positive?: boolean;
}

const SHOW_FIRST = 8;

/**
 * Concept A of the Assets card: every asset in one list, largest first, each with one
 * black bar comparing it with the largest item, its share of all assets and its value.
 * A kind filter (All · Cash · Investments · Things you own) replaces a colour legend;
 * the foot says where the numbers come from.
 */
export function AssetsList({ items, total }: { items: AssetItem[]; total: number }) {
  const t = useTranslations("insights.netWorth.assetsList");
  const [kind, setKind] = useState<"all" | AssetKind>("all");
  const [showAll, setShowAll] = useState(false);

  const sorted = [...items].sort((a, z) => z.value - a.value);
  const shown = kind === "all" ? sorted : sorted.filter((i) => i.kind === kind);
  const visible = showAll ? shown : shown.slice(0, SHOW_FIRST);
  const largest = Math.max(...sorted.map((i) => i.value), 0.01);
  const kinds = (["cash", "investments", "things"] as const).filter((k) => items.some((i) => i.kind === k));
  const count = (s: AssetSource) => items.filter((i) => i.source === s).length;
  const pct = (v: number) => (total > 0 ? Math.round((Math.max(0, v) / total) * 100) : 0);

  return (
    <div className="flex flex-col gap-4">
      {kinds.length > 1 && (
        <Segmented
          label={t("filterLabel")}
          surface="tile"
          size="sm"
          value={kind}
          onChange={(v) => { setKind(v); setShowAll(false); }}
          items={[
            { value: "all", label: t("all", { count: items.length }) },
            ...kinds.map((k) => ({ value: k, label: t(k) })),
          ]}
          className="self-start"
        />
      )}

      <div aria-hidden className="hidden grid-cols-[40px_minmax(0,1fr)_200px_112px] gap-3.5 px-2.5 text-xs font-semibold text-clear-muted md:grid">
        <span />
        <span>{t("sortedBy")}</span>
        <span>{t("share")}</span>
        <span className="text-right">{t("value")}</span>
      </div>

      <ul aria-label={t("listLabel")} className="m-0 -mt-2 flex list-none flex-col p-0">
        {visible.map((i) => {
          const row = (
            <>
              <span className="shrink-0">{i.icon}</span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[15px] font-bold">{i.name}</span>
                <span className="flex min-w-0 items-center gap-2 text-[13px] text-clear-muted">
                  <span className="truncate">{i.meta}</span>
                  {i.stale && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 font-bold text-clear-ember-text">
                      <span aria-hidden className="size-2 rounded-full bg-clear-ember" />
                      {t("updateValue")}
                    </span>
                  )}
                </span>
                {/* Phones: the bar sits under the name. */}
                <span aria-hidden className="mt-1 block h-1.5 overflow-hidden rounded-full bg-clear-tile md:hidden">
                  <span className="block h-full rounded-full bg-clear-primary" style={{ width: `${(Math.max(0, i.value) / largest) * 100}%` }} />
                </span>
              </span>
              <span aria-hidden className="hidden items-center gap-2.5 md:flex">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-clear-tile">
                  <span className="block h-full rounded-full bg-clear-primary" style={{ width: `${(Math.max(0, i.value) / largest) * 100}%` }} />
                </span>
                <span className="w-9 text-right text-[13px] font-bold tabular-nums text-clear-ink-2">{pct(i.value)}%</span>
              </span>
              <Amount
                value={i.value}
                sign={i.positive ? "always" : "auto"}
                splitCents={false}
                className={cn("text-right text-[15px]", i.positive && "text-clear-positive", i.value < 0 && "text-clear-negative")}
              />
            </>
          );
          const cls =
            "grid min-h-[58px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-clear-row border-b border-clear-ground px-2.5 py-2 md:grid-cols-[40px_minmax(0,1fr)_200px_112px]";
          const href = i.stale ? "/settings?panel=accounts" : i.href;
          return (
            <li key={i.key}>
              {href ? (
                <Link href={href} className={cn(cls, "text-clear-ink no-underline transition-colors hover:bg-clear-tile")}>
                  {row}
                </Link>
              ) : (
                <div className={cls}>{row}</div>
              )}
            </li>
          );
        })}
      </ul>

      {shown.length > SHOW_FIRST && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="-mt-2 self-start cursor-pointer px-2.5 text-sm font-bold text-clear-ember-text hover:underline"
        >
          {showAll ? t("showLess") : t("showAll", { count: shown.length })}
        </button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px] text-clear-ink-2">
        <span>{t("compareNote")}</span>
        <span className="inline-flex flex-wrap gap-1.5">
          {count("synced") > 0 && <ClearChip tone="sky">{t("chipSynced", { count: count("synced") })}</ClearChip>}
          {count("entered") > 0 && <ClearChip>{t("chipEntered", { count: count("entered") })}</ClearChip>}
          {count("plan") + count("debts") > 0 && <ClearChip tone="rose">{t("chipPlan", { count: count("plan") + count("debts") })}</ClearChip>}
        </span>
      </div>
    </div>
  );
}

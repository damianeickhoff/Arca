"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconChevronRight } from "@tabler/icons-react";
import { ClearCard, ClearCardHeader } from "@/components/clear/card";
import { Segmented } from "@/components/clear/segmented";
import { pastelTones, TONE_FILL, type ClearTone } from "@/components/clear/tones";
import { CategorySpendingListPortal } from "@/components/category-spending-list-portal";
import { CategoryDetailPortal } from "@/components/category-detail-portal";
import type { CategorySpendCard } from "@/components/category-spending-row";
import type { FinancialMonthConfig } from "@/lib/date-range";
import { formatEur, formatEurWhole } from "@/lib/format";
import { blockMapLayout, withOther } from "@/lib/period-facts";
import { cn } from "@/lib/utils";
import { MoneyText } from "@/components/clear/money";

/** Theme colours for categories without a colour of their own. */
const PALETTE = [
  "var(--clr-ink)",
  "var(--clr-ember)",
  "var(--clr-info-fill)",
  "var(--clr-positive-fill)",
  "var(--clr-warning-fill)",
  "var(--clr-lilac-ink)",
  "var(--clr-rose-ink)",
  "var(--clr-stone-ink)",
];
const OTHER_COLOR = "var(--clr-placeholder)";
/** Rows shown before "N more" opens the full list (fewer on a phone). */
const ROWS = 10;
const PHONE_ROWS = 6;
/** Blocks on the map; smaller groups beyond these join Other. */
const BLOCKS = 7;

type View = "group" | "category";

interface Block {
  key: string;
  /** The group to open; null for Other, which opens the full list. */
  id: number | null;
  name: string;
  value: number;
  tone: ClearTone;
  /** "36% · −€38" */
  detail: string;
}

/**
 * Insights · Overview "Where it went": the groups as a block map where area is money
 * (tap a block for that group's categories), or under Categories every category as a
 * share strip and bar rows, biggest first and "Other" last, with a switch between
 * groups and categories; Details (and "Other") opens the full list. Under it, what
 * still has no category, with the way to Needs review.
 */
export function CategoryBreakdownCard({
  spendingVisible,
  spendingAll,
  spendingTotal,
  groups,
  previousGroups,
  previousMonth,
  uncategorised,
  ongoing,
  financialMonth,
  budgetPeriod,
  className,
}: {
  /** Spending categories shown on the card (the ones not hidden from spending rows). */
  spendingVisible: CategorySpendCard[];
  /** Every spending category, for the full list. */
  spendingAll: CategorySpendCard[];
  spendingTotal: number;
  /** The same lists added up per group. */
  groups: { spendingVisible: CategorySpendCard[]; spendingAll: CategorySpendCard[] };
  /** What each group (by id) came to in the previous period. */
  previousGroups: Record<number, number>;
  /** The previous period's short month name, or "none" ("last period"). */
  previousMonth: string;
  /** Spending in the period without a category: the transactions and their total. */
  uncategorised: { count: number; amount: number };
  /** The period includes today, so the total is "so far". */
  ongoing: boolean;
  financialMonth: FinancialMonthConfig;
  budgetPeriod: { from: string; to: string };
  className?: string;
}) {
  const t = useTranslations("insights.overview");
  const [view, setView] = useState<View>("group");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const byGroup = view === "group";
  const visible = byGroup ? groups.spendingVisible : spendingVisible;
  const all = byGroup ? groups.spendingAll : spendingAll;
  const total = spendingTotal;
  const selected = all.find((r) => r.categoryId === selectedId) ?? null;
  const listTitle = byGroup ? t("byGroup") : t("byCategory");
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  const breakdown = withOther(visible, total);
  const hasOther = breakdown.other > 0.005;
  const empty = breakdown.rows.length === 0 && !hasOther;
  const missing = uncategorised;

  return (
    <ClearCard aria-labelledby="insights-categories-title" className={cn("gap-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ClearCardHeader
          title={<span id="insights-categories-title">{t("breakdown.title")}</span>}
          subtitle={byGroup ? t("breakdown.blocksHint") : t("breakdown.rowsHint")}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div data-tip-anchor="insightsGroupSwitch">
            <Segmented
              label={t("groupSwitch")}
              surface="tile"
              size="sm"
              value={view}
              onChange={(v) => {
                setView(v);
                setShowAll(false);
              }}
              items={[
                { value: "group", label: t("groups") },
                { value: "category", label: t("categories") },
              ]}
            />
          </div>
          {all.length > 0 && (
            <button type="button" onClick={() => setShowAll(true)} className="cursor-pointer px-1 text-sm font-bold text-clear-ember-text hover:underline">
              {t("details")}
            </button>
          )}
        </div>
      </div>

      {empty ? (
        <p className="m-0 flex flex-1 items-center justify-center py-8 text-center text-sm text-clear-muted">{t("noSpending")}</p>
      ) : byGroup ? (
        <BlockMap
          blocks={groupBlocks(breakdown, previousGroups, share, { other: t("other"), same: t("breakdown.sameAs", { period: previousMonth }) })}
          onOpen={(id) => (id != null ? setSelectedId(id) : setShowAll(true))}
          label={t("breakdown.stripLabel", {
            parts: [...breakdown.rows.map((r) => `${r.categoryName} ${share(r.spent)}%`), ...(hasOther ? [`${t("other")} ${share(breakdown.other)}%`] : [])].join(", "),
          })}
        />
      ) : (
        <CategoryRows breakdown={breakdown} total={total} ongoing={ongoing} onOpen={setSelectedId} onShowAll={() => setShowAll(true)} />
      )}

      {missing.count > 0 && (
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px]">
          <span className="text-clear-muted">
            <MoneyText>{t("breakdown.noCategory", { amount: formatEurWhole(missing.amount) })}</MoneyText>
          </span>
          <Link href="/transactions/needs-review" className="font-semibold text-clear-ember-text no-underline hover:underline">
            {t("breakdown.sortCount", { count: missing.count })}
          </Link>
        </div>
      )}

      <CategorySpendingListPortal open={showAll} rows={all} onClose={() => setShowAll(false)} onSelect={(id) => setSelectedId(id)} title={listTitle} />
      <CategoryDetailPortal
        category={selected ? { categoryId: selected.categoryId, categoryName: selected.categoryName, color: selected.color, icon: selected.icon } : null}
        financialMonth={financialMonth}
        budgetPeriod={budgetPeriod}
        onClose={() => setSelectedId(null)}
      />
    </ClearCard>
  );
}

/** The groups as blocks: the biggest ones in their own pastel, the rest (and what no
 *  group holds) together as Other, each with its share and the change since last period. */
function groupBlocks(
  breakdown: { rows: CategorySpendCard[]; other: number },
  previous: Record<number, number>,
  share: (v: number) => number,
  labels: { other: string; same: string },
): Block[] {
  const named = breakdown.rows.slice(0, BLOCKS - (breakdown.rows.length > BLOCKS || breakdown.other > 0.005 ? 1 : 0));
  const other = breakdown.other + breakdown.rows.slice(named.length).reduce((s, r) => s + r.spent, 0);
  const tones = pastelTones(named.map((r) => r.color));
  const change = (value: number, before: number | undefined) => {
    if (!before) return null;
    const diff = value - before;
    if (Math.abs(diff) < 1) return labels.same;
    return `${diff > 0 ? "+" : "−"}${formatEurWhole(Math.abs(diff))}`;
  };
  const detail = (value: number, before?: number) => [`${share(value)}%`, change(value, before)].filter(Boolean).join(" · ");
  return [
    ...named.map((r, i) => ({
      key: String(r.categoryId),
      id: r.categoryId,
      name: r.categoryName,
      value: r.spent,
      tone: tones[i],
      detail: detail(r.spent, previous[r.categoryId]),
    })),
    ...(other > 0.005 ? [{ key: "other", id: null, name: labels.other, value: other, tone: "neutral" as const, detail: detail(other) }] : []),
  ];
}

/**
 * Area is money: the largest block is a column over the full height, the others share
 * the rest in two rows (lib/period-facts blockMapLayout). Column widths, row heights
 * and block widths are all proportional to the amounts. A block too small for its
 * figures shows only what fits (container queries on the block's own size).
 */
function BlockMap({ blocks, onOpen, label }: { blocks: Block[]; onOpen: (id: number | null) => void; label: string }) {
  const { lead, rows } = blockMapLayout(blocks);
  if (!lead) return null;
  const sum = (row: Block[]) => row.reduce((s, b) => s + b.value, 0);
  const rest = rows.reduce((s, row) => s + sum(row), 0);

  return (
    <div
      role="group"
      aria-label={label}
      data-tip-anchor="insightsBlockMap"
      className="grid min-h-[220px] flex-1 gap-2"
      style={{
        gridTemplateColumns: rows.length ? `minmax(0, ${lead.value}fr) minmax(0, ${rest}fr)` : "minmax(0, 1fr)",
        gridTemplateRows: rows.length === 2 ? `minmax(0, ${sum(rows[0])}fr) minmax(0, ${sum(rows[1])}fr)` : "minmax(0, 1fr)",
      }}
    >
      <BlockTile block={lead} lead onOpen={onOpen} style={{ gridColumn: 1, gridRow: "1 / -1" }} />
      {rows.map((row, i) => (
        <div key={i} className="flex min-h-0 min-w-0 gap-2" style={{ gridColumn: 2, gridRow: i + 1 }}>
          {row.map((b) => (
            <BlockTile key={b.key} block={b} onOpen={onOpen} style={{ flex: `${b.value} 1 0` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function BlockTile({ block, lead = false, onOpen, style }: { block: Block; lead?: boolean; onOpen: (id: number | null) => void; style: React.CSSProperties }) {
  const amount = formatEurWhole(block.value);
  return (
    <button
      type="button"
      onClick={() => onOpen(block.id)}
      aria-label={`${block.name}, ${amount}, ${block.detail}`}
      style={style}
      className={cn(
        "flex min-h-0 min-w-0 cursor-pointer flex-col justify-between gap-1 overflow-hidden rounded-clear-tile px-3.5 py-3 text-left font-clear transition-opacity [container-type:size] hover:opacity-85",
        "outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50",
        TONE_FILL[block.tone],
      )}
    >
      <span className="truncate text-[13px] font-semibold [@container(max-width:56px)]:hidden">{block.name}</span>
      <span aria-hidden className="flex min-w-0 flex-col [@container(max-height:58px)]:hidden [@container(max-width:72px)]:hidden">
        <MoneyText>
          <span className={cn("truncate font-bold tabular-nums tracking-[-0.02em]", lead ? "text-[22px]" : "text-xl")}>{amount}</span>
        </MoneyText>
        <span className="truncate text-xs font-medium opacity-80 [@container(max-height:84px)]:hidden">
          <MoneyText>{block.detail}</MoneyText>
        </span>
      </span>
    </button>
  );
}

/** The Categories view: the total, a share strip of every part and a bar row each. */
function CategoryRows({
  breakdown,
  total,
  ongoing,
  onOpen,
  onShowAll,
}: {
  breakdown: { rows: CategorySpendCard[]; other: number };
  total: number;
  ongoing: boolean;
  onOpen: (id: number) => void;
  onShowAll: () => void;
}) {
  const t = useTranslations("insights.overview");
  const named = breakdown.rows.map((r, i) => ({
    key: String(r.categoryId),
    id: r.categoryId as number | null,
    name: r.categoryName,
    value: r.spent,
    color: r.color ?? PALETTE[i % PALETTE.length],
  }));
  const shown = named.slice(0, ROWS);
  const hidden = named.length - shown.length;
  const phoneHidden = Math.max(0, named.length - PHONE_ROWS);
  const other = breakdown.other > 0.005 ? { key: "other", id: null, name: t("other"), value: breakdown.other, color: OTHER_COLOR } : null;
  const strip = [...named, ...(other ? [other] : [])];
  const rows = [...shown, ...(other ? [other] : [])];
  const largest = Math.max(1, ...rows.map((r) => r.value));
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  const totalLine = ongoing ? t("breakdown.spentSoFar") : t("breakdown.spent");
  const partsLine = t("breakdown.categories", { count: named.length, other: other ? "yes" : "no" });

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <b className="clear-amount text-[28px] leading-none font-bold! tracking-[-0.02em]">
          <MoneyText>{formatEurWhole(total)}</MoneyText>
        </b>
        <span className="text-[13px] text-clear-muted">
          {totalLine} · {partsLine}
        </span>
      </div>

      <div
        role="img"
        aria-label={t("breakdown.stripLabel", { parts: strip.map((r) => `${r.name} ${share(r.value)}%`).join(", ") })}
        className="flex h-4 gap-0.5 overflow-hidden rounded-full"
      >
        {strip.map((r) => (
          <span key={r.key} className="h-full min-w-0.5" style={{ width: `${(r.value / Math.max(total, 1)) * 100}%`, background: r.color }} />
        ))}
      </div>

      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((r, i) => (
          <li key={r.key} className={cn("border-b border-clear-ground last:border-b-0", i >= PHONE_ROWS && r.id != null && "max-lg:hidden")}>
            <button
              type="button"
              onClick={() => (r.id != null ? onOpen(r.id) : onShowAll())}
              className="-mx-2 grid min-h-10 w-[calc(100%+1rem)] cursor-pointer grid-cols-[10px_minmax(0,1fr)_40px_auto] items-center gap-3 rounded-clear-row px-2 text-left text-sm transition-colors hover:bg-clear-tile sm:grid-cols-[10px_minmax(0,150px)_minmax(0,1fr)_44px_96px]"
            >
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: r.color }} />
              <span className="truncate font-semibold">{r.name}</span>
              <span aria-hidden className="h-2 overflow-hidden rounded-full bg-clear-tile max-sm:hidden">
                <span className={cn("block h-full rounded-full", r.id == null && "opacity-50")} style={{ width: `${(r.value / largest) * 100}%`, background: r.color }} />
              </span>
              <span className="text-right text-[13px] text-clear-muted tabular-nums">{share(r.value)}%</span>
              <span className="text-right font-bold tabular-nums">
                <MoneyText>{formatEur(r.value)}</MoneyText>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {phoneHidden > 0 && <MoreButton count={phoneHidden} onClick={onShowAll} className="lg:hidden" />}
      {hidden > 0 && <MoreButton count={hidden} onClick={onShowAll} className="max-lg:hidden" />}
    </>
  );
}

function MoreButton({ count, onClick, className }: { count: number; onClick: () => void; className?: string }) {
  const t = useTranslations("insights.overview");
  return (
    <button type="button" onClick={onClick} className={cn("inline-flex min-h-8 cursor-pointer items-center gap-1 self-start text-[13px] font-bold text-clear-ember-text", className)}>
      {t("moreCount", { count })}
      <IconChevronRight size={14} stroke={2.4} aria-hidden />
    </button>
  );
}

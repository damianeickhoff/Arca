"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconChevronDown, IconRepeat } from "@tabler/icons-react";
import { RecurringClient, RecurringRestoreButton } from "@/components/settings/recurring/recurring-client";
import { RecurringDetailDialog } from "@/components/settings/recurring/recurring-detail-dialog";
import { RecurringSuggestions } from "@/components/settings/recurring/recurring-suggestions";
import type { SuggestionView } from "@/lib/recurring-suggestions";
import { ContextualTip } from "@/components/contextual-tip";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { SettingsEmpty, SettingsSearch } from "@/components/settings/settings-ui";
import { Icon } from "@/components/icon";
import { ListRow } from "@/components/clear/list-row";
import { ClearChip } from "@/components/clear/chip";
import { Amount } from "@/components/clear/amount";
import { MoneyText } from "@/components/clear/money";
import { formatEur, toMonthly } from "@/lib/format";
import { UNCATEGORIZED_ICON, UNCATEGORIZED_COLOR } from "@/lib/auto-brand";
import { recurringPeriodStatus } from "@/lib/recurring-status";
import { nextOccurrence } from "@/lib/recurring-occurrence";
import { shiftDate } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import type { RecurringItem, Category } from "@/db/schema";
import type { PlanProgress } from "@/lib/payment-plan";

const FILTERS = ["all", "income", "bill", "subscription", "debt", "plan", "savings"] as const;
type Filter = (typeof FILTERS)[number];

// Stored budget types are Dutch; the labels live under recurringForm.budgetTypes.
const BUDGET_KEY: Record<string, "needs" | "wants" | "savings"> = { nodig: "needs", willen: "wants", sparen: "savings" };

interface Props {
  items: RecurringItem[];
  categories: Category[];
  /** Payment plans only: how far each is paid off, by item id. */
  planProgress: Record<number, PlanProgress>;
  /** Regular payments the detector found, waiting for Accept / Not a bill. */
  suggestions: SuggestionView[];
}

/** The Recurring settings panel: the monthly total, type filters and a search, then the
 *  current recurring items (running or starting later; a row opens its detail). Below
 *  them a collapsed Archived section holds the paused and ended items (same rows, same
 *  filter and search, opened by itself when a search matches one), then the dismissed
 *  auto-detected items to restore. The summary, counts and total use current items only. */
export function RecurringMenuClient({ items, categories, planProgress, suggestions }: Props) {
  const t = useTranslations("settings.recurringList");
  const tPanels = useTranslations("settings.panels");
  const tForm = useTranslations("recurringForm");
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  // The Archived section is collapsed by default. While a search matches archived rows
  // it opens by itself; its header can still close it for that query.
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [archivedSearchClosed, setArchivedSearchClosed] = useState(false);
  // Track just the id, not the item object — otherwise router.refresh() (e.g. after
  // saving an edit) produces new item objects in `items` while this state keeps
  // pointing at the stale pre-edit object, so the open dialog never shows the update.
  const [detailItemId, setDetailItemId] = useState<number | null>(null);
  const detailItem = detailItemId != null ? items.find((i) => i.id === detailItemId) ?? null : null;
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // "Next" must be the next date the item is actually still due — the bill-status
  // due date this used to read is the occurrence inside the *current* financial month,
  // which is in the past for anything already due this month. Anchored on yesterday so
  // an item due today still reads as today rather than skipping a whole interval.
  const dueDateByItemId = useMemo(() => {
    const anchor = shiftDate(new Date().toISOString().slice(0, 10), -1);
    const map: Record<number, string> = {};
    for (const item of items) {
      // Without an anchor (due day or start date) there's nothing to project from —
      // showing a made-up "1st of the month" would be worse than showing nothing.
      if (item.dueDay == null && !item.startDate) continue;
      const next = nextOccurrence(item, anchor);
      if (next) map[item.id] = next;
    }
    return map;
  }, [items]);

  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const endFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const query = search.trim().toLowerCase();

  // Current = running now or starting later (a "future" item keeps its Upcoming chip even
  // though the lifecycle keeps it switched off until then). Archived = paused by the user
  // or past its end date: out of the list, the counts and the total.
  const isArchived = (i: RecurringItem) => {
    const status = recurringPeriodStatus(i);
    return i.paused || status === "expired" || (!i.active && status !== "future");
  };
  const currentItems = items.filter((i) => !i.dismissed && !isArchived(i));
  const archivedItems = items.filter((i) => !i.dismissed && isArchived(i));
  const countFor = (f: Filter) => (f === "all" ? currentItems.length : currentItems.filter((i) => i.type === f).length);

  // Rows shown for the current filter + search query — alphabetical, so the list is a
  // stable index you can scan for a specific bill. `base` sensitivity so casing and
  // accents don't split otherwise-adjacent names.
  const applyView = (list: RecurringItem[]) =>
    list
      .filter((i) => (filter === "all" ? true : i.type === filter))
      .filter((i) => !query || i.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const visible = applyView(currentItems);
  const archivedVisible = applyView(archivedItems);

  const archivedAutoOpen = !!query && archivedVisible.length > 0;
  const showArchived = archivedAutoOpen ? !archivedSearchClosed : archivedOpen;
  const toggleArchived = () => (archivedAutoOpen ? setArchivedSearchClosed((v) => !v) : setArchivedOpen((v) => !v));
  const onSearch = (value: string) => {
    setSearch(value);
    setArchivedSearchClosed(false);
  };

  // Monthly total for the summary line: income items in the income view, otherwise the
  // non-income items (all) or the chosen type.
  const isIncomeView = filter === "income";
  const totalPool = currentItems.filter((i) =>
    isIncomeView ? i.type === "income" : filter === "all" ? i.type !== "income" : i.type === filter,
  );
  const monthlyTotal = totalPool.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);

  const dismissedItems = filter === "all" ? items.filter((i) => i.dismissed) : [];

  // One row, shared by the current list and the Archived section. Archived rows are
  // dimmed and say why they're archived where current rows show the next date.
  const renderRow = (item: RecurringItem, archived: boolean) => {
    const cat = item.categoryId != null ? catById.get(item.categoryId) : undefined;
    const due = dueDateByItemId[item.id];
    const status = recurringPeriodStatus(item);
    const budgetKey = item.budgetType ? BUDGET_KEY[item.budgetType] : undefined;
    const progress = item.type === "plan" ? planProgress[item.id] : undefined;
    const reason = archived
      ? status === "expired" && item.endDate
        ? t("archivedEnded", { date: endFmt.format(new Date(`${item.endDate}T12:00:00`)) })
        : t("archivedPaused")
      : null;
    const meta = [
      cat?.name ?? t("noCategory"),
      progress && item.planParts
        ? t("planProgress", { paid: progress.paidParts, parts: item.planParts, left: formatEur(progress.remaining) })
        : tForm(`frequencies.${item.frequency}` as "frequencies.monthly"),
      reason ?? (due ? t("next", { date: dateFmt.format(new Date(`${due}T12:00:00`)) }) : null),
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <ListRow
        key={item.id}
        onClick={() => setDetailItemId(item.id)}
        className={cn(archived && "opacity-60")}
        icon={
          <Icon
            iconKey={cat?.icon ?? UNCATEGORIZED_ICON}
            color={cat?.icon ? cat.color : UNCATEGORIZED_COLOR}
            soft
            size="md"
          />
        }
        title={
          <span className="inline-flex min-w-0 max-w-full items-center gap-2">
            <span className="truncate">{item.name}</span>
            {status === "future" && <ClearChip tone="sky" className="h-6 px-2.5 text-xs">{t("upcoming")}</ClearChip>}
            {item.source === "auto" && <ClearChip tone="lilac" className="h-6 px-2.5 text-xs">{t("auto")}</ClearChip>}
          </span>
        }
        meta={meta}
        trailing={
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            {item.amount ? (
              <Amount value={item.type === "income" ? item.amount : -item.amount} sign={item.type === "income" ? "always" : "auto"} className="text-[17px]" />
            ) : (
              <span className="text-[17px] font-bold text-clear-muted">—</span>
            )}
            <span className="text-xs text-clear-muted">
              {tForm(`types.${item.type}` as "types.bill")}
              {budgetKey ? ` · ${tForm(`budgetTypes.${budgetKey}`)}` : ""}
            </span>
          </span>
        }
      />
    );
  };

  return (
    <>
      <ContextualTip id="recurring" />
      <PanelHeader title={tPanels("recurring.title")} action={<RecurringClient action="add" variant="default" />} />

      <div className="flex flex-col gap-4 px-4 pt-1 font-clear text-clear-ink">
        {/* Summary */}
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-bold text-clear-ink-2">
            {t("summaryLabel", { shown: visible.length, count: currentItems.length })}
          </span>
          <span className="flex flex-wrap items-baseline gap-x-2">
            <Amount value={monthlyTotal} className="text-[34px] leading-none tracking-[-0.03em]" />
            <span className="text-sm text-clear-muted">{isIncomeView ? t("perMonthIncome") : t("perMonthExpenses")}</span>
          </span>
        </div>

        {/* What the detector found: reviewed here as well as on Upcoming. */}
        <RecurringSuggestions suggestions={suggestions} className="bg-clear-tile p-4" />

        {/* Filters */}
        <div role="group" aria-label={t("filterLabel")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {FILTERS.map((f) => {
            const on = f === filter;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f)}
                className={cn(
                  "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-clear-ember/50",
                  on ? "bg-clear-primary text-clear-primary-ink" : "bg-clear-tile text-clear-ink hover:bg-clear-line",
                )}
              >
                {t(`filters.${f}`)}
                <span className={cn("tabular-nums", on ? "opacity-70" : "text-clear-muted")}>{countFor(f)}</span>
              </button>
            );
          })}
        </div>

        <SettingsSearch value={search} onChange={onSearch} placeholder={t("search")} label={t("search")} />

        {/* List */}
        <div className="flex flex-col">
          {visible.length === 0 ? (
            <SettingsEmpty icon={<IconRepeat stroke={1.9} />} action={<RecurringClient action="add" variant="default" />}>
              {query ? t("noMatch") : t("empty")}
            </SettingsEmpty>
          ) : (
            visible.map((item) => renderRow(item, false))
          )}

          {/* Paused and ended items: out of the list and the total, still openable. */}
          {archivedVisible.length > 0 && (
            <section aria-labelledby="recurring-archived" className="mt-5 flex flex-col gap-1.5">
              <h3 id="recurring-archived" className="m-0">
                <button
                  type="button"
                  aria-expanded={showArchived}
                  aria-controls="recurring-archived-rows"
                  onClick={toggleArchived}
                  className="flex h-10 w-full cursor-pointer items-center rounded-clear-icon bg-clear-tile px-3 text-left text-[15px] font-bold text-clear-ink outline-none transition-colors hover:bg-clear-line focus-visible:ring-3 focus-visible:ring-clear-ember/50"
                >
                  {t("archived")} <span className="ml-1 font-semibold text-clear-muted">· {archivedVisible.length}</span>
                  <IconChevronDown
                    size={18}
                    stroke={2.2}
                    aria-hidden
                    className={cn("ml-auto shrink-0 text-clear-muted transition-transform", showArchived && "rotate-180")}
                  />
                </button>
              </h3>
              {showArchived && (
                <div id="recurring-archived-rows" className="flex flex-col">
                  {archivedVisible.map((item) => renderRow(item, true))}
                </div>
              )}
            </section>
          )}

          {/* Dismissed auto-detected items — kept so detection never recreates them, restorable. */}
          {dismissedItems.length > 0 && (
            <section aria-labelledby="recurring-dismissed" className="mt-5 flex flex-col gap-1.5">
              <h3 id="recurring-dismissed" className="m-0 flex h-10 items-center rounded-clear-icon bg-clear-tile px-3 text-[15px] font-bold">
                {t("dismissed")} <span className="ml-1 font-semibold text-clear-muted">· {dismissedItems.length}</span>
              </h3>
              {dismissedItems.map((item) => (
                <div key={item.id} className="flex min-h-16 items-center gap-3 border-b border-clear-ground px-2 last:border-b-0">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-bold text-clear-ink-2">{item.name}</span>
                    <span className="truncate text-[13px] text-clear-muted">
                      <MoneyText>
                        {item.matchPattern ? t("pattern", { pattern: item.matchPattern }) : t("notDetectedAgain")}
                        {item.amount ? ` · ${formatEur(item.amount)}` : ""}
                      </MoneyText>
                    </span>
                  </div>
                  <RecurringRestoreButton item={item} />
                </div>
              ))}
            </section>
          )}
        </div>
      </div>

      <RecurringDetailDialog
        item={detailItem}
        category={detailItem?.categoryId != null ? catById.get(detailItem.categoryId) ?? null : null}
        categories={categories}
        dueDate={detailItem ? dueDateByItemId[detailItem.id] ?? null : null}
        onClose={() => setDetailItemId(null)}
      />
    </>
  );
}

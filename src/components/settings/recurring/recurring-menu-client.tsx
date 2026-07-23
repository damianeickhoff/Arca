"use client";

import { useMemo, useState } from "react";
import { IconAdjustmentsHorizontal as Filter, IconCheck as Check, IconSearch as Search } from "@tabler/icons-react";
import { RecurringClient, RecurringRestoreButton } from "@/components/settings/recurring/recurring-client";
import { RecurringDetailDialog } from "@/components/settings/recurring/recurring-detail-dialog";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/icon";
import { formatEur, toMonthly } from "@/lib/format";
import { UNCATEGORIZED_ICON, UNCATEGORIZED_COLOR } from "@/lib/auto-brand";
import { cn } from "@/lib/utils";
import type { RecurringItem, Category } from "@/db/schema";

const FILTERS = [
  { value: "all",          label: "All" },
  { value: "income",       label: "Income" },
  { value: "bill",         label: "Bills" },
  { value: "subscription", label: "Subscriptions" },
  { value: "debt",         label: "Debts" },
] as const;

const ITEM_LABELS: Record<string, string> = {
  income: "Income", bill: "Bill", subscription: "Subscription", debt: "Debt",
};

const FREQ_LABELS: Record<string, string> = {
  monthly: "Monthly", yearly: "Yearly", weekly: "Weekly", once: "One-time",
};

interface Props {
  items: RecurringItem[];
  categories: Category[];
  /** Map of recurring item id → computed next-due date (YYYY-MM-DD), monthly items only. */
  dueDateByItemId: Record<number, string>;
}

function fmtDue(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function RecurringMenuClient({ items, categories, dueDateByItemId }: Props) {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  // Track just the id, not the item object — otherwise router.refresh() (e.g. after
  // saving an edit) produces new item objects in `items` while this state keeps
  // pointing at the stale pre-edit object, so the open dialog never shows the update.
  const [detailItemId, setDetailItemId] = useState<number | null>(null);
  const detailItem = detailItemId != null ? items.find((i) => i.id === detailItemId) ?? null : null;
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const activeItems = items.filter((i) => !i.dismissed);
  const query = search.trim().toLowerCase();

  // Items shown for the current filter + search query.
  const visible = activeItems
    .filter((i) => (filter === "all" ? true : i.type === filter))
    .filter((i) => !query || i.name.toLowerCase().includes(query))
    .sort((a, b) => {
      const da = dueDateByItemId[a.id];
      const dbb = dueDateByItemId[b.id];
      if (da && dbb) return da.localeCompare(dbb);
      if (da) return -1;
      if (dbb) return 1;
      return a.name.localeCompare(b.name);
    });

  // Monthly total for the header line. For income the total is income items; for any
  // expense-oriented filter (all/bill/subscription/debt) it's the non-income items.
  const isIncomeView = filter === "income";
  const totalPool = activeItems.filter((i) =>
    isIncomeView ? i.type === "income" : (filter === "all" ? i.type !== "income" : i.type === filter),
  );
  const monthlyTotal = totalPool.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
  const perMonthLabel = isIncomeView ? "in income per month" : "in expenses per month";

  const dismissedItems = filter === "all" ? items.filter((i) => i.dismissed) : [];

  const activeFilterLabel = FILTERS.find((f) => f.value === filter)!.label;

  const filterMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Filter"
        className="size-11 rounded-full bg-white/70 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center active:scale-[0.97] transition-transform shrink-0"
      >
        <Filter className="size-5 text-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {FILTERS.map((f) => (
          <DropdownMenuItem key={f.value} onClick={() => setFilter(f.value)}>
            <span className="flex-1">{f.label}</span>
            {filter === f.value && <Check className="size-4 text-foreground/70" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <PanelHeader
        title="Recurring"
        action={<>{filterMenu}<RecurringClient action="add" variant="default" /></>}
      />

      <div className="px-4 pt-3 pb-28 var(--dialog-background)">
        {/* Total line */}
        <div className="mb-6">
          <p className="text-md text-foreground/50">
            {filter === "all" ? "Total" : activeFilterLabel} <span className="font-black px-1">·</span> <span className="text-foreground/50"><span className="bg-[var(--dialog-content-background)] px-2 py-0.5 rounded-full">{visible.length}/{activeItems.length}</span> transaction{activeItems.length === 1 ? "" : "s"} active</span>
          </p>
          <p className="text-4xl font-medium tabular-nums tracking-tight py-3">{formatEur(monthlyTotal)}</p>
          <p className="text-md text-foreground/45 -mt-1">{perMonthLabel}</p>
        </div>

        {/* List */}
        {visible.length === 0 && dismissedItems.length === 0 ? (
          <div className="rounded-2xl bg-[var(--dialog-content-background)] py-16 text-center text-muted-foreground">
            <p className="text-sm">No recurring items found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((item) => {
              const cat = item.categoryId != null ? catById.get(item.categoryId) : undefined;
              const due = dueDateByItemId[item.id];
              const subtitle = cat ? cat.name : (ITEM_LABELS[item.type] ?? item.type);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDetailItemId(item.id)}
                  className="block w-full text-left"
                >
                    <div className={cn("flex items-top gap-4 rounded-2xl bg-[var(--dialog-content-background)] px-4 py-3.5", !item.active && "opacity-50")}>
                      <Icon
                        iconKey={cat?.icon ?? UNCATEGORIZED_ICON}
                        color={cat?.icon ? cat.color : UNCATEGORIZED_COLOR}
                        size="md"
                        round
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-semibold truncate leading-tight">{item.name}</p>
                          {item.source === "auto" && (
                            <span className="shrink-0 rounded-full bg-primary/10 text-primary text-[10px] font-medium px-1.5 py-0.5 leading-none">
                              Auto
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground/50 truncate">
                          {subtitle}
                          {!item.active && " · Inactive"}
                        </p>
                        <p className="text-sm text-foreground/50 truncate">
                          {due && <> Next {fmtDue(due)}</>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-semibold tabular-nums leading-tight">
                          {item.amount ? formatEur(item.amount) : "—"}
                        </p>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-5 rounded bg-foreground/10 text-xs font-extralight flex items-center justify-center">
                            {(FREQ_LABELS[item.frequency] ?? item.frequency).charAt(0)}
                          </span>
                          <span className="text-sm font-light text-foreground/45">{FREQ_LABELS[item.frequency] ?? item.frequency}</span>
                        </span>
                      </div>
                    </div>
                </button>
              );
            })}

            {/* Dismissed auto-detected items — kept so detection never recreates them, restorable. */}
            {dismissedItems.length > 0 && (
              <section className="pt-4">
                <h2 className="text-sm font-medium text-foreground/40 px-1 mb-2">Dismissed</h2>
                <div className="space-y-3">
                  {dismissedItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-4 rounded-2xl bg-[var(--dialog-content-background)] px-5 py-4 opacity-70">
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-semibold truncate leading-tight">{item.name}</p>
                        <p className="text-sm text-foreground/50 mt-0.5 truncate">
                          {item.matchPattern ? `Pattern: ${item.matchPattern}` : "Won't be auto-detected again"}
                        </p>
                      </div>
                      <RecurringRestoreButton item={item} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Hovering search bar — absolute against the (positioned) dialog panel so it
          floats at the panel's bottom over the scrolling list, same convention as the
          Categories panel's search + add bar. */}
      <div className="absolute inset-x-0 bottom-[calc(1.5rem+var(--sab))] px-4 z-30">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recurring"
            className="h-14 w-full rounded-full bg-black/7 dark:bg-white/7 backdrop-blur-lg pl-12 pr-4 text-base outline-none placeholder:text-muted-foreground"
          />
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

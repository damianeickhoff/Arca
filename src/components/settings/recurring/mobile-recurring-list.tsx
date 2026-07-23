"use client";

import { useState } from "react";
import { RecurringClient, RecurringRestoreButton } from "./recurring-client";
import { formatEur, toMonthly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icon";
import { UNCATEGORIZED_ICON, UNCATEGORIZED_COLOR } from "@/lib/auto-brand";
import type { RecurringItem, Category } from "@/db/schema";

const GROUPS = ["income", "bill", "subscription", "debt"] as const;
// Plural labels used as section headers.
const GROUP_LABELS: Record<string, string> = {
  income: "Income", bill: "Bills", subscription: "Subscriptions", debt: "Debts",
};
// Singular labels used as the per-card subtitle (like "Cash Account" in the accounts list).
const ITEM_LABELS: Record<string, string> = {
  income: "Income", bill: "Bill", subscription: "Subscription", debt: "Debt",
};
const FREQ_LABELS: Record<string, string> = {
  yearly: "jaar", weekly: "week", monthly: "mnd", once: "eenmalig",
};

// Pill filter options — "all" plus one per group.
const FILTERS = [
  { value: "all",          label: "All" },
  { value: "income",       label: "Income" },
  { value: "bill",         label: "Bills" },
  { value: "subscription", label: "Subscriptions" },
  { value: "debt",         label: "Debts" },
] as const;

interface Props {
  items: RecurringItem[];
  /** Used to show each item's auto-assigned category (name + icon). */
  categories?: Category[];
  /** Search query, controlled from the header actions (search toggle). */
  search?: string;
}

/** Section heading in the grey, small-caps style of the accounts list ("Active"). */
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-baseline gap-2 px-1 mb-2">
      <h2 className="text-sm font-medium text-foreground/40">{label}</h2>
    </div>
  );
}

/** Mobile recurring-items list — each item is its own rounded card with a bold title,
 * a grey subtitle and a right-aligned monthly amount (accounts-list style). Per-category
 * totals live in the summary cards up top; a pill row filters by type. Tapping a card
 * opens the edit dialog. */
export function MobileRecurringList({ items, categories = [], search }: Props) {
  const [filter, setFilter] = useState<string>("all");
  const catById = new Map(categories.map((c) => [c.id, c]));
  const query = (search ?? "").trim().toLowerCase();
  const visibleGroups = filter === "all" ? GROUPS : GROUPS.filter((g) => g === filter);

  function groupItems(g: string) {
    return items
      .filter((i) => i.type === g && !i.dismissed)
      .filter((i) => !query || i.name.toLowerCase().includes(query));
  }

  // Per-category monthly totals for the summary cards (active, non-dismissed items only).
  const totals: Record<string, number> = {};
  for (const g of GROUPS) {
    totals[g] = items
      .filter((i) => i.type === g && !i.dismissed && i.active)
      .reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
  }

  // Dismissed auto-detected items only surface in the unfiltered "all" view.
  const dismissedItems = filter !== "all" ? [] : items
    .filter((i) => i.dismissed)
    .filter((i) => !query || i.name.toLowerCase().includes(query));

  const noResults = visibleGroups.every((g) => groupItems(g).length === 0) && dismissedItems.length === 0;

  return (
    <div className="space-y-5">
      {/* Summary cards — per-category monthly total, one card each. */}
      <div className="grid grid-cols-2 gap-3">
        {GROUPS.map((g) => (
          <div key={g} className="rounded-2xl bg-card px-4 py-3">
            <p className="text-xs text-foreground/50 mb-1">{GROUP_LABELS[g]}</p>
            <p className="text-lg font-semibold tabular-nums leading-tight">
              {formatEur(totals[g])}
              <span className="text-xs font-normal text-foreground/40 ml-0.5">/mnd</span>
            </p>
          </div>
        ))}
      </div>

      {/* Pill filter — switch between all types. */}
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              filter === f.value
                ? "bg-foreground text-primary-foreground"
                : "bg-card text-foreground/60",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {noResults ? (
        <div className="rounded-2xl bg-card py-16 text-center text-muted-foreground">
          <p className="text-sm">No fixed costs found</p>
        </div>
      ) : (
        <div className="space-y-7">
          {visibleGroups.map((g) => {
            const rows = groupItems(g);
            if (rows.length === 0) return null;
            return (
              <section key={g}>
                <SectionHeader label={GROUP_LABELS[g]} />
                <div className="space-y-3">
                  {rows.map((item) => {
                    const monthly = toMonthly(item.amount, item.frequency);
                    const isNonMonthly = item.frequency !== "monthly" && item.amount;
                    return (
                      <RecurringClient
                        key={item.id}
                        action="edit"
                        item={item}
                        trigger={
                          (() => {
                          const cat = item.categoryId != null ? catById.get(item.categoryId) : undefined;
                          // Recurring items always take their icon from the assigned category — brand
                          // logos belong to transactions (matched by name), not to recurring items.
                          // (Some items still carry a stale brand icon like "siPlex" in the DB; it's
                          // deliberately ignored here so the category icon shows consistently.)
                          return (
                          <div className={`flex items-center gap-4 rounded-2xl bg-card px-5 py-4 ${!item.active ? "opacity-50" : ""}`}>
                            <Icon
                              iconKey={cat?.icon ?? UNCATEGORIZED_ICON}
                              color={cat?.icon ? cat.color : UNCATEGORIZED_COLOR}
                              size="xl"
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
                              <p className="text-sm text-foreground/50 mt-0.5 truncate">
                                {cat ? cat.name : (ITEM_LABELS[item.type] ?? item.type)}
                                {!item.active && " · Inactief"}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-lg font-semibold tabular-nums leading-tight">
                                {item.amount ? formatEur(monthly) : "—"}
                              </p>
                              {isNonMonthly ? (
                                <p className="text-xs text-foreground/40 tabular-nums mt-0.5">
                                  {formatEur(item.amount ?? 0)}/{FREQ_LABELS[item.frequency] ?? item.frequency}
                                </p>
                              ) : item.amount ? (
                                <p className="text-xs text-foreground/40 mt-0.5">/mnd</p>
                              ) : null}
                            </div>
                          </div>
                          );
                          })()
                        }
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}

          {/* Dismissed auto-detected items — kept so detection never recreates them, restorable. */}
          {dismissedItems.length > 0 && (
            <section>
              <SectionHeader label="Dismissed" />
              <div className="space-y-3">
                {dismissedItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 rounded-2xl bg-card px-5 py-4 opacity-70">
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
  );
}

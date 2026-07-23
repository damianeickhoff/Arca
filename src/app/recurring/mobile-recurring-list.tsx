import { Icon } from "@/components/icon";
import { RecurringClient } from "./recurring-client";
import { PageEmptyState } from "@/components/page-empty-state";
import { IconRepeat as Repeat } from "@tabler/icons-react";
import { formatEur, toMonthly } from "@/lib/format";
import type { RecurringItem } from "@/db/schema";

const GROUPS = ["income", "bill", "subscription", "debt"] as const;
const TYPE_LABELS: Record<string, string> = {
  income: "Inkomsten", bill: "Rekeningen", subscription: "Abonnementen", debt: "Schulden",
};
const FREQ_LABELS: Record<string, string> = {
  yearly: "jaar", weekly: "week", monthly: "mnd", once: "eenmalig",
};

interface Props {
  items: RecurringItem[];
  /** Group filter + search query, controlled from the header actions (icon dropdown / search toggle). */
  group?: string;
  search?: string;
}

/** Mobile recurring-items list — same card/row language as the transactions page's
 * mobile list (grouped sections, round icon chip, trailing amount under the title). */
export function MobileRecurringList({ items, group, search }: Props) {
  const query = (search ?? "").trim().toLowerCase();
  const visibleGroups = group ? GROUPS.filter((g) => g === group) : GROUPS;

  function groupItems(g: string) {
    return items
      .filter((i) => i.type === g)
      .filter((i) => !query || i.name.toLowerCase().includes(query));
  }

  const noResults = visibleGroups.every((g) => groupItems(g).length === 0);

  return (
    <div className="space-y-4">
      {/* Groups, styled like the transactions page's day groups */}
      {noResults ? (
        <PageEmptyState
          icon={Repeat}
          title={query ? "Geen vaste kosten gevonden" : "No recurring items yet"}
          description={query ? undefined : "Add your fixed income, bills, subscriptions and debts to plan ahead."}
        />
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((g) => {
            const groupRows = groupItems(g);
            if (groupRows.length === 0) return null;
            const total = groupRows.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
            return (
              <div key={g} className="rounded-xl bg-card pb-5">
                <div className="flex items-center gap-2 px-3 mb-5">
                  <h2 className="font-medium text-xl ml-4 mt-7">{TYPE_LABELS[g]}</h2>
                  <span className="text-sm text-foreground/40 mt-8 tabular-nums">({formatEur(total)}/mnd)</span>
                </div>
                {groupRows.map((item) => {
                  const monthly = toMonthly(item.amount, item.frequency);
                  const isNonMonthly = item.frequency !== "monthly" && item.amount;
                  return (
                    <div key={item.id} className={`flex items-center gap-5 px-6 py-3 ${!item.active ? "opacity-50" : ""}`}>
                      <Icon iconKey={item.icon} color={item.iconColor} round size="xxl" />
                      <div className="flex-1 min-w-0">
                        <p className="text-md font-medium truncate leading-tight">{item.name}</p>
                        <p className="text-sm text-foreground/60 mt-0.5 truncate tabular-nums">
                          {item.amount ? (
                            <>
                              {formatEur(monthly)}/mnd
                              {isNonMonthly && ` · ${formatEur(item.amount)} /${FREQ_LABELS[item.frequency] ?? item.frequency}`}
                            </>
                          ) : "—"}
                          {!item.active && " · Inactief"}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <RecurringClient action="edit" item={item} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

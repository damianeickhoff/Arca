"use client";

import { useTranslations } from "next-intl";
import { IconChevronRight } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClearDialogHeader } from "@/components/clear/dialog-chrome";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CategorySpendCard } from "@/components/category-spending-row";
import { MoneyText } from "@/components/clear/money";

/**
 * Every category with spend (or income) this period, including ones hidden from the
 * spending overview — opened from Insights' donut card ("Details" / "N more"). Tapping
 * a row opens the category detail. The shared Dialog: a centred modal sized to its
 * content on desktop, a bottom sheet on phones.
 */
export function CategorySpendingListPortal({
  open,
  rows,
  onClose,
  onSelect,
  title,
  income = false,
}: {
  open: boolean;
  rows: CategorySpendCard[];
  onClose: () => void;
  onSelect: (categoryId: number) => void;
  /** Already translated; defaults to "Spending by category". */
  title?: string;
  /** Income categories: amounts with a plus and no budget line. */
  income?: boolean;
}) {
  const t = useTranslations("categoryList");
  const isIncome = income || title === t("incomeTitle");
  const heading = title ?? t("title");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent hideHeaderRow title={heading} className="gap-4 pt-6">
        <ClearDialogHeader title={heading} subtitle={t("count", { count: rows.length })} onClose={onClose} closeLabel={t("close")} />
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((c) => {
            const over = c.pct != null && c.pct > 1;
            const sub = isIncome
              ? null
              : c.excluded
                ? t("hidden")
                : c.budget != null
                  ? over
                    ? t("over", { amount: formatEur(c.spent - c.budget) })
                    : t("ofBudget", { amount: formatEur(c.budget) })
                  : t("noLimit");
            return (
              <li key={c.categoryId} className="border-b border-clear-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => onSelect(c.categoryId)}
                  className="group flex min-h-14 w-full cursor-pointer items-center gap-3 py-2 text-left"
                >
                  <Icon iconKey={c.icon} color={c.color} size="md" soft />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={cn("truncate text-[15px] font-bold group-hover:underline group-hover:underline-offset-4", c.excluded && "text-clear-muted")}>
                      {c.categoryName}
                    </span>
                    {sub && (
                      <span className={cn("truncate text-xs", over && !c.excluded ? "font-semibold text-clear-negative" : "text-clear-muted")}>
                        <MoneyText>{sub}</MoneyText>
                      </span>
                    )}
                  </span>
                  <span className={cn("clear-amount shrink-0 text-[15px]", isIncome ? "text-clear-positive" : c.excluded ? "text-clear-muted" : "text-clear-ink")}>
                    <MoneyText>{`${isIncome ? "+" : ""}${formatEur(c.spent)}`}</MoneyText>
                  </span>
                  <IconChevronRight aria-hidden className="size-4 shrink-0 text-clear-muted" stroke={2.2} />
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { VariablePrognoseOverrideBtn } from "./variable-override-btn";
import { Icon } from "@/components/icon";
import { formatEur } from "@/lib/format";
import type { Category } from "@/db/schema";

type VariableBudgetRowData = Category & { budgetAmount: number; overrideAmount: number | null; effectiveAmount: number };

// One parent category, in the same "rounded card containing its rows" shape as the
// category selector (src/components/category-picker.tsx's CategoryGrid) — the parent
// row plus its indented subcategories share a single card, instead of a separate
// dot+name header floating above a set of loose cards. A chevron on the parent row
// toggles the subcategories; unlike the category selector, this is not a picker, so
// that toggle is the only interactive addition.
export function CategoryCard({
  category, subcategories, month,
}: {
  category: VariableBudgetRowData;
  subcategories: VariableBudgetRowData[];
  month: string;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = subcategories.length > 0;

  return (
    <div className="rounded-2xl bg-card overflow-hidden">
      <VariablePrognoseOverrideBtn
        categoryId={category.id}
        categoryName={category.name}
        month={month}
        defaultAmount={category.budgetAmount}
        overrideAmount={category.overrideAmount}
        icon={<Icon iconKey={category.icon} color={category.color} round size="sm" />}
        subtitle={`${formatEur(category.effectiveAmount)}/mnd`}
        nested
        collapseToggle={hasChildren ? { open, onToggle: () => setOpen((v) => !v) } : undefined}
      />
      {hasChildren && open && (
        <div className="pl-8 pb-1 space-y-0.5">
          {subcategories.map((child) => (
            <VariablePrognoseOverrideBtn
              key={child.id}
              categoryId={child.id}
              categoryName={child.name}
              month={month}
              defaultAmount={child.budgetAmount}
              overrideAmount={child.overrideAmount}
              icon={<Icon iconKey={child.icon} color={child.color} round size="xs" />}
              subtitle={`${formatEur(child.effectiveAmount)}/mnd`}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
}

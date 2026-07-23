"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CategoryClient } from "./category-client";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { BUDGET_TYPE_LABELS } from "@/lib/format";
import type { Category, CategoryRule, Bank } from "@/db/schema";
import { IconCheckFilled as Check, IconXFilled as X } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { groupCategoriesByParent, resolveCategoryColor } from "@/lib/category-tree";

interface Props {
  categories: Category[];
  rulesByCat: Record<number, CategoryRule[]>;
  banks: Bank[];
  txCountByCat?: Record<number, number>;
}

const BUDGET_TYPE_OPTIONS = [
  { value: "nodig",  label: "Needs" },
  { value: "willen", label: "Wants" },
  { value: "sparen", label: "Savings" },
];

export function CategoryList({ categories, rulesByCat, banks, txCountByCat = {} }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const { topLevel, childrenByParentId } = groupCategoriesByParent(categories);

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() { setSelected(new Set()); }

  async function applyBudgetType(budgetType: string) {
    if (selected.size === 0) return;
    setSaving(true);
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), budgetType }),
    });
    setSaving(false);
    clearSelection();
    router.refresh();
  }

  const anySelected = selected.size > 0;

  const gridClass = "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3";
  const childless = topLevel.filter((c) => !childrenByParentId.has(c.id));
  const withChildren = topLevel.filter((c) => childrenByParentId.has(c.id));

  return (
    <div className="relative space-y-4">
      {childless.length > 0 && (
        <div className={gridClass}>
          {childless.map((cat) => (
            <DesktopCategoryTile
              key={cat.id}
              cat={cat}
              rulesByCat={rulesByCat}
              banks={banks}
              categories={categories}
              isSelected={selected.has(cat.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {withChildren.map((parent) => (
        <div key={parent.id} className="rounded-2xl bg-card/50 p-3">
          <div className={gridClass}>
            <DesktopCategoryTile
              cat={parent}
              rulesByCat={rulesByCat}
              banks={banks}
              categories={categories}
              isSelected={selected.has(parent.id)}
              onToggleSelect={toggleSelect}
            />
          </div>
          <div className={cn(gridClass, "mt-3 pt-3 border-t border-foreground/10")}>
            {(childrenByParentId.get(parent.id) ?? []).map((cat) => (
              <DesktopCategoryTile
                key={cat.id}
                cat={cat}
                rulesByCat={rulesByCat}
                banks={banks}
                categories={categories}
                isSelected={selected.has(cat.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        </div>
      ))}

      {categories.length === 0 && (
        <div className="py-16 text-center text-muted-foreground">
          <p className="text-sm">No categories gevonden</p>
        </div>
      )}

      {anySelected && (
        <div className="fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl bg-card border shadow-xl px-4 py-3">
          <span className="text-sm font-medium text-foreground/70 mr-1">
            {selected.size} geselecteerd
          </span>
          <div className="flex items-center gap-1.5">
            {BUDGET_TYPE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => applyBudgetType(opt.value)}
                className="text-xs"
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <button
            onClick={clearSelection}
            className="ml-1 size-7 flex items-center justify-center rounded-full hover:bg-foreground/10 text-foreground/50 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function DesktopCategoryTile({
  cat,
  rulesByCat,
  banks,
  categories,
  isSelected,
  onToggleSelect,
}: {
  cat: Category;
  rulesByCat: Record<number, CategoryRule[]>;
  banks: Bank[];
  categories: Category[];
  isSelected: boolean;
  onToggleSelect: (id: number) => void;
}) {
  const catRules = rulesByCat[cat.id] ?? [];
  return (
    <div
      className={cn(
        "group relative flex flex-col items-center gap-2 rounded-2xl p-3 pt-4 transition-colors cursor-pointer select-none",
        isSelected ? "bg-primary/10" : "bg-card hover:bg-muted/40",
      )}
      onClick={() => onToggleSelect(cat.id)}
    >
      <div className={cn("rounded-full ring-2 ring-offset-2 transition-all", isSelected ? "ring-primary" : "ring-transparent")}>
        <Icon iconKey={cat.icon} color={resolveCategoryColor(cat, categories)} round size="xxl" />
      </div>

      {isSelected && (
        <div className="absolute top-2 right-2 size-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="size-3 text-primary-foreground" />
        </div>
      )}

      <span className="text-xs font-medium text-center leading-tight line-clamp-2 w-full text-foreground/80">
        {cat.name}
      </span>
      {cat.budgetType && (
        <span className="text-[10px] text-foreground/40 -mt-1">
          {BUDGET_TYPE_LABELS[cat.budgetType] ?? cat.budgetType}
        </span>
      )}

      <div
        className="absolute top-2 left-2 lg:opacity-0 lg:group-hover:opacity-100 lg:transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <CategoryClient action="edit" category={cat} rules={catRules} banks={banks} categories={categories} />
      </div>
    </div>
  );
}

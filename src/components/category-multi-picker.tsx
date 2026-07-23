"use client";

import { useEffect, useMemo, useState } from "react";
import { IconCheck as Check, IconSearch as Search } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import type { Category } from "@/db/schema";

// Multi-select category sheet — grouped the same way as the single-select
// CategoryGrid (top-level cards with children indented beneath), but with a
// checkbox per row instead of a radio dot, and selection only commits when the
// header's checkmark is tapped (X/backdrop-dismiss discards the staged picks).
export function CategoryMultiPicker({
  categories,
  selected,
  open,
  onOpenChange,
  onApply,
}: {
  categories: Category[];
  selected: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (ids: string[]) => void;
}) {
  const [staged, setStaged] = useState<string[]>(selected);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setStaged(selected);
    setSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const query = search.trim().toLowerCase();
  const { topLevel, childrenByParentId } = useMemo(() => {
    const matches = (c: Category) => !query || c.name.toLowerCase().includes(query);
    const idsPresent = new Set(categories.filter(matches).map((c) => c.id));
    const topLevel: Category[] = [];
    const childrenByParentId = new Map<number, Category[]>();
    for (const cat of categories) {
      if (!matches(cat)) continue;
      const isTop = cat.parentCategoryId === null || !idsPresent.has(cat.parentCategoryId);
      if (isTop) {
        topLevel.push(cat);
      } else {
        const siblings = childrenByParentId.get(cat.parentCategoryId!);
        if (siblings) siblings.push(cat);
        else childrenByParentId.set(cat.parentCategoryId!, [cat]);
      }
    }
    return { topLevel, childrenByParentId };
  }, [categories, query]);

  function toggle(id: string) {
    setStaged((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  const allIds = categories.map((c) => String(c.id));
  const allSelected = allIds.length > 0 && allIds.every((id) => staged.includes(id));
  function toggleAll() {
    setStaged(allSelected ? [] : allIds);
  }

  function confirm() {
    onApply(staged);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        fullHeight
        hideHandle
        className="pt-3"
        title="Select Categories"
        headerAction={
          <button
            type="button"
            onClick={confirm}
            aria-label="Confirm"
            className="size-11 rounded-full bg-foreground text-background flex items-center justify-center"
          >
            <Check className="size-5" />
          </button>
        }
        footer={
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-foreground/40 pointer-events-none" />
              <input
                type="text"
                placeholder="Search category"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-11 text-sm rounded-full pl-10 pr-4 bg-foreground/5 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={toggleAll}
              className="shrink-0 h-11 rounded-full bg-foreground/5 px-4 text-sm font-semibold text-foreground"
            >
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-1.5">
          {topLevel.map((cat) => {
            const children = childrenByParentId.get(cat.id) ?? [];
            return (
              <div key={cat.id} className="rounded-xl bg-card p-1.5">
                <CategoryCheckRow category={cat} active={staged.includes(String(cat.id))} onClick={() => toggle(String(cat.id))} />
                {children.length > 0 && (
                  <div className="flex flex-col gap-1.5 mt-1.5 pl-4">
                    {children.map((child) => (
                      <CategoryCheckRow
                        key={child.id}
                        category={child}
                        iconSize="xs"
                        active={staged.includes(String(child.id))}
                        onClick={() => toggle(String(child.id))}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {topLevel.length === 0 && <p className="text-sm text-foreground/40 text-center py-6">No categories found</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryCheckRow({
  category,
  iconSize = "sm",
  active,
  onClick,
}: {
  category: Category;
  iconSize?: "xs" | "sm";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors cursor-pointer text-left w-full",
        active ? "bg-card" : "hover:bg-card",
      )}
    >
      <Icon iconKey={category.icon} color={category.color} round size={iconSize} />
      <span className="flex-1 min-w-0 text-sm truncate">{category.name}</span>
      <span
        className={cn(
          "size-6 rounded-md border flex items-center justify-center shrink-0",
          active ? "bg-foreground text-background" : "border-foreground/25",
        )}
      >
        {active && <Check className="size-4" />}
      </span>
    </button>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { IconCheck as Check, IconSearch as Search } from "@tabler/icons-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ResponsivePopover } from "@/components/clear/responsive-popover";
import { clearButtonVariants } from "@/components/clear/button-variants";
import { Icon } from "@/components/icon";
import { useIsDesktop } from "@/lib/use-is-desktop";
import { cn } from "@/lib/utils";
import type { Category } from "@/db/schema";

// Multi-select category picker — grouped the same way as the single-select
// CategoryGrid (top-level cards with children indented beneath), but with a
// checkbox per row instead of a radio dot, and selection only commits on confirm
// (X/backdrop-dismiss discards the staged picks). With a `trigger` it is a popover
// anchored to that chip on desktop and a sheet on phones; without one, always a sheet.
export function CategoryMultiPicker({
  categories,
  selected,
  open,
  onOpenChange,
  onApply,
  trigger,
}: {
  categories: Category[];
  selected: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (ids: string[]) => void;
  trigger?: React.ReactElement<React.ComponentProps<"button">>;
}) {
  const t = useTranslations("transactions.filters");
  const isDesktop = useIsDesktop();
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

  const searchField = (
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-clear-muted" />
      <input
        type="text"
        placeholder={t("searchCategory")}
        aria-label={t("searchCategory")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-11 w-full rounded-full bg-clear-tile pl-10 pr-4 text-sm text-clear-ink outline-none placeholder:text-clear-placeholder focus:ring-3 focus:ring-clear-ember/25"
      />
    </div>
  );

  const list = (popover: boolean) => (
    <div className="flex flex-col gap-1.5">
      {topLevel.map((cat) => {
        const children = childrenByParentId.get(cat.id) ?? [];
        return (
          <div key={cat.id} className={popover ? undefined : "rounded-clear-tile bg-clear-card p-1.5"}>
            <CategoryCheckRow category={cat} active={staged.includes(String(cat.id))} onClick={() => toggle(String(cat.id))} />
            {children.length > 0 && (
              <div className="mt-0.5 flex flex-col gap-0.5 pl-4">
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
      {topLevel.length === 0 && <p className="py-6 text-center text-sm text-clear-muted">{t("noCategories")}</p>}
    </div>
  );

  const confirmButton = (
    <button type="button" onClick={confirm} aria-label={t("confirm")} className={clearButtonVariants({ size: "icon" })}>
      <Check className="size-5" />
    </button>
  );

  const sheetFooter = (
    <div className="flex items-center gap-3">
      {searchField}
      <button type="button" onClick={toggleAll} className={clearButtonVariants({ variant: "secondary" })}>
        {allSelected ? t("deselectAll") : t("selectAll")}
      </button>
    </div>
  );

  if (!trigger) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent fullHeight hideHandle className="pt-3" title={t("selectCategories")} headerAction={confirmButton} footer={sheetFooter}>
          {list(false)}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={onOpenChange}
      title={t("selectCategories")}
      trigger={trigger}
      sheet={{ fullHeight: true, hideHandle: true, className: "pt-3", headerAction: confirmButton }}
      footer={
        isDesktop ? (
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={toggleAll} className={clearButtonVariants({ variant: "ghost", size: "sm" })}>
              {allSelected ? t("deselectAll") : t("selectAll")}
            </button>
            <button type="button" onClick={confirm} className={clearButtonVariants({ size: "sm" })}>
              {t("apply")}
            </button>
          </div>
        ) : (
          sheetFooter
        )
      }
    >
      {isDesktop && <div className="sticky top-0 z-10 -mx-1.5 -mt-1.5 mb-1.5 bg-clear-card p-1.5">{searchField}</div>}
      {list(isDesktop)}
    </ResponsivePopover>
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
      aria-pressed={active}
      className="flex w-full cursor-pointer items-center gap-3 rounded-clear-row px-2 py-2 text-left transition-colors hover:bg-clear-tile"
    >
      <Icon iconKey={category.icon} color={category.color} round size={iconSize} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{category.name}</span>
      <CheckBox active={active} />
    </button>
  );
}

/** The square tick shared by the multi-pickers. */
export function CheckBox({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors",
        active ? "border-clear-primary bg-clear-primary text-clear-primary-ink" : "border-clear-line",
      )}
    >
      {active && <Check className="size-3.5" stroke={3} />}
    </span>
  );
}

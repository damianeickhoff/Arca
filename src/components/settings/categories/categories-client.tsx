"use client";

import { useState } from "react";
import { IconChevronRight as ChevronRight, IconPlus as Plus, IconSearch as Search } from "@tabler/icons-react";
import { Icon } from "@/components/icon";
import { CategoryClient } from "@/components/settings/categories/category-client";
import { CategorySettingsClient } from "@/components/settings/categories/category-settings-client";
import { PanelHeader } from "@/components/settings/settings-panel-chrome";
import { groupCategoriesByParent, resolveCategoryColor } from "@/lib/category-tree";
import { BUDGET_TYPE_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StaggerItem } from "@/components/ui/stagger";
import type { Category, CategoryRule, Bank } from "@/db/schema";

interface Props {
  categories: Category[];
  rulesByCat: Record<number, CategoryRule[]>;
  banks: Bank[];
}

export function CategoriesClient({ categories, rulesByCat, banks }: Props) {
  const [search, setSearch] = useState("");
  const [editMode, setEditMode] = useState(false);

  // Drill-down into a single category's detail/edit screen, shown as a slide-over
  // *inside* the dialog (not a route) so the panel's own Back returns here instead
  // of tearing down the whole settings dialog to the dashboard. `detail` is the
  // selected category; `detailVisible` drives the slide transform so it can animate
  // out before unmounting.
  const [detail, setDetail] = useState<Category | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  function openDetail(cat: Category) {
    setDetail(cat);
    requestAnimationFrame(() => setDetailVisible(true));
  }
  function closeDetail() {
    setDetailVisible(false);
    setTimeout(() => setDetail(null), 300);
  }

  const { topLevel, childrenByParentId } = groupCategoriesByParent(categories);
  const query = search.trim().toLowerCase();
  const searchResults = query ? categories.filter((c) => c.name.toLowerCase().includes(query)) : [];

  return (
    <>
      <PanelHeader
        title="Categories"
        action={
          <button
            type="button"
            onClick={() => setEditMode((m) => !m)}
            className="px-4 h-9 rounded-full bg-white/60 dark:bg-white/7 text-sm font-medium text-foreground active:scale-[0.97] transition-transform"
          >
            {editMode ? "Done" : "Edit"}
          </button>
        }
      />

      <div className="px-4 pt-1 pb-28">
        {query ? (
          searchResults.length === 0 ? (
            <EmptyState label="No categories found" />
          ) : (
            <div className="rounded-2xl bg-[var(--dialog-content-background)] overflow-hidden divide-y divide-border/50">
              {searchResults.map((cat) => (
                <CategoryRow key={cat.id} cat={cat} categories={categories} onSelect={openDetail} />
              ))}
            </div>
          )
        ) : topLevel.length === 0 ? (
          <EmptyState label="No categories yet" />
        ) : (
          <div className="space-y-6">
            {topLevel.map((parent, i) => {
              const children = childrenByParentId.get(parent.id) ?? [];
              return (
                <StaggerItem key={parent.id} index={i}>
                  <section>
                    <div className="flex items-center justify-between px-3 mb-2">
                      <h2 className="text-sm font-medium text-muted-foreground">{parent.name}</h2>
                      {children.length > 0 && (
                        <button
                          type="button"
                          onClick={() => openDetail(parent)}
                          className="text-sm font-medium text-muted-foreground active:opacity-70"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    <div className="rounded-2xl bg-[var(--dialog-content-background)] overflow-hidden divide-y divide-border/50">
                      {children.length > 0 ? (
                        children.map((child) => (
                          <CategoryRow key={child.id} cat={child} categories={categories} indent onSelect={openDetail} />
                        ))
                      ) : (
                        <CategoryRow cat={parent} categories={categories} onSelect={openDetail} />
                      )}
                      {editMode && <AddSubcategoryRow parent={parent} categories={categories} />}
                    </div>
                  </section>
                </StaggerItem>
              );
            })}
          </div>
        )}
      </div>

      {/* Hovering search + add bar — absolute against the (positioned) dialog panel so it
          floats at the panel's bottom over the scrolling list. */}
      <div className="absolute inset-x-0 bottom-[calc(1.5rem+var(--sab))] px-4 z-30">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories"
              className="h-14 w-full rounded-full bg-black/7 dark:bg-white/7 backdrop-blur-lg pl-12 pr-4 text-base outline-none placeholder:text-muted-foreground"
            />
          </div>
          <CategoryClient
            action="add"
            variant="custom"
            categories={categories}
            className="flex size-14 items-center justify-center rounded-full bg-black/7 dark:bg-white/7 backdrop-blur-lg active:scale-[0.95] transition-transform shrink-0"
          >
            <Plus className="size-6" />
          </CategoryClient>
        </div>
      </div>

      {/* Category detail/edit — slid over the list inside the dialog. `fixed inset-0`
          so it covers the whole drawer; its own header Back calls closeDetail, which
          returns here rather than popping browser history to the dashboard. Keyed by
          id so switching categories reseeds the form. */}
      {detail && (
        <div
          className="fixed inset-0 z-[70] flex flex-col overflow-y-auto rounded-t-4xl bg-[var(--dialog-background)] transition-transform duration-300 ease-out"
          style={{ transform: detailVisible ? "translateX(0)" : "translateX(100%)" }}
        >
          <CategorySettingsClient
            key={detail.id}
            category={detail}
            rules={rulesByCat[detail.id] ?? []}
            banks={banks}
            categories={categories}
            onClose={closeDetail}
          />
        </div>
      )}
    </>
  );
}

function CategoryRow({
  cat,
  categories,
  indent = false,
  onSelect,
}: {
  cat: Category;
  categories: Category[];
  indent?: boolean;
  onSelect: (cat: Category) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(cat)}
      className="block w-full text-left active:bg-foreground/5 transition-colors"
    >
      <div className={cn("flex items-center gap-3 py-3.5", indent ? "px-4" : "px-4")}>
        <Icon iconKey={cat.icon} color={resolveCategoryColor(cat, categories)} round size={indent ? "lg" : "xl"} />
        <div className="min-w-0 flex-1">
          <p className={cn("font-semibold text-foreground truncate", indent ? "text-base" : "text-lg")}>{cat.name}</p>
          {cat.budgetType && (
            <p className="text-sm text-muted-foreground">{BUDGET_TYPE_LABELS[cat.budgetType] ?? cat.budgetType}</p>
          )}
        </div>
        <ChevronRight className="size-5 text-muted-foreground shrink-0" />
      </div>
    </button>
  );
}

function AddSubcategoryRow({ parent, categories }: { parent: Category; categories: Category[] }) {
  return (
    <CategoryClient
      action="add"
      variant="custom"
      categories={categories}
      defaultParentId={parent.id}
      className="flex items-center gap-3 px-4 py-3.5 w-full text-left active:bg-foreground/5 transition-colors"
    >
      <span className="size-10 rounded-full bg-white/7 flex items-center justify-center shrink-0">
        <Plus className="size-5" />
      </span>
      <span className="flex-1 text-base font-semibold text-muted-foreground">Add subcategory</span>
      <ChevronRight className="size-5 text-muted-foreground shrink-0" />
    </CategoryClient>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl bg-card py-16 text-center text-muted-foreground">
      <p className="text-sm">{label}</p>
    </div>
  );
}

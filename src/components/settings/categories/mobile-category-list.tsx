"use client";

import { useLayoutEffect, useState } from "react";
import Link from "next/link";
import { BUDGET_TYPE_LABELS } from "@/lib/format";
import { Icon } from "@/components/icon";
import { CategoryClient } from "@/components/settings/categories/category-client";
import type { Category, CategoryRule, Bank } from "@/db/schema";
import { IconChevronRight as ChevronRight, IconPlus as Plus, IconSearch as Search } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { StaggerItem } from "@/components/ui/stagger";
import { groupCategoriesByParent, resolveCategoryColor } from "@/lib/category-tree";

interface Props {
  categories: Category[];
  rulesByCat: Record<number, CategoryRule[]>;
  banks: Bank[];
  txCountByCat?: Record<number, number>;
  group?: string;
  search?: string;
}

const SCROLL_KEY = "categories-list-scroll";

// Saved by CategoryRow just before drilling into a category. Restoring on return
// can't rely on native scroll restoration: the list page is force-dynamic and
// router.refresh() re-renders it, so the document isn't tall enough to scroll to
// the saved offset until after a few frames.
function restoreScroll() {
  const raw = sessionStorage.getItem(SCROLL_KEY);
  if (raw === null) return;
  const target = Number(raw);
  if (!Number.isFinite(target) || target <= 0) {
    sessionStorage.removeItem(SCROLL_KEY);
    return;
  }

  // The list page is force-dynamic and save() also calls router.refresh(), so the
  // list can render short first and grow a few hundred ms later. Re-apply the offset
  // every frame until it actually sticks (page is tall enough) or we time out — a
  // fixed frame count gives up before the refreshed content has laid out.
  const start = performance.now();
  const tick = () => {
    window.scrollTo(0, target);
    const stuck = Math.abs(window.scrollY - target) <= 2;
    if (stuck || performance.now() - start > 2000) {
      sessionStorage.removeItem(SCROLL_KEY);
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function MobileCategoryList({ categories, search: initialSearch }: Props) {
  const [search, setSearch] = useState(initialSearch ?? "");

  useLayoutEffect(restoreScroll, []);

  const query = search.trim().toLowerCase();
  const items = query ? categories.filter((c) => c.name.toLowerCase().includes(query)) : categories;
  const { topLevel, childrenByParentId } = groupCategoriesByParent(items);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="h-12 w-full rounded-full bg-card pl-12 pr-4 text-base outline-none placeholder:text-muted-foreground"
        />
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-card py-16 text-center text-muted-foreground">
          <p className="text-sm">No categories founds</p>
        </div>
      ) : query ? (
        // Searching: flat results — a matching sub-category's parent may not itself match.
        <div className="rounded-2xl bg-card overflow-hidden divide-y divide-border/50">
          {items.map((cat) => (
            <CategoryRow key={cat.id} cat={cat} categories={categories} />
          ))}
        </div>
      ) : (
        <div className="space-y-4 pb-28">
          {topLevel.map((parent, i) => (
            <StaggerItem key={parent.id} index={i}>
              <div className="rounded-2xl bg-card overflow-hidden divide-y divide-border/50">
                <CategoryRow cat={parent} categories={categories} />
                {(childrenByParentId.get(parent.id) ?? []).map((child) => (
                  <CategoryRow key={child.id} cat={child} categories={categories} indent />
                ))}
                <AddSubcategoryRow parent={parent} categories={categories} />
              </div>
            </StaggerItem>
          ))}
        </div>
      )}

      {/* Floating add-category button */}
      <CategoryClient
        action="add"
        variant="custom"
        categories={categories}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 h-14 rounded-full bg-primary backdrop-blur-lg text-primary-foreground pl-5 pr-6 text-base font-bold shadow-floating shadow-primary/30 active:scale-[0.97] transition-transform"
      >
        <Plus className="size-6" />
        Add Category
      </CategoryClient>
    </div>
  );
}

function CategoryRow({ cat, categories, indent = false }: { cat: Category; categories: Category[]; indent?: boolean }) {
  const content = (
    <div className={cn("flex items-center gap-3 py-3.5", indent ? "pl-4 pr-4" : "px-4")}>
      <Icon iconKey={cat.icon} color={resolveCategoryColor(cat, categories)} round size={indent ? "lg" : "xl"} />
      <div className="min-w-0 flex-1">
        <p className={cn("font-semibold text-foreground truncate", indent ? "text-base" : "text-lg")}>{cat.name}</p>
        {cat.budgetType && (
          <p className="text-sm text-muted-foreground">{BUDGET_TYPE_LABELS[cat.budgetType] ?? cat.budgetType}</p>
        )}
      </div>
      <ChevronRight className="size-5 text-muted-foreground shrink-0" />
    </div>
  );

  return (
    <Link
      href={`/settings/categories/${cat.id}`}
      onClick={() => sessionStorage.setItem(SCROLL_KEY, String(window.scrollY))}
      className="block active:bg-foreground/5 transition-colors"
    >
      {content}
    </Link>
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
      <span className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Plus className="size-5 text-primary" />
      </span>
      <span className="flex-1 text-base font-semibold text-primary">Add subcategory</span>
      <ChevronRight className="size-5 text-primary/50 shrink-0" />
    </CategoryClient>
  );
}

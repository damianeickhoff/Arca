import type { Category } from "@/db/schema";

export interface CategoryTree {
  topLevel: Category[];
  childrenByParentId: Map<number, Category[]>;
}

/** Groups categories into top-level entries and their children, keeping input order. */
export function groupCategoriesByParent(categories: Category[]): CategoryTree {
  const topLevel: Category[] = [];
  const childrenByParentId = new Map<number, Category[]>();

  for (const cat of categories) {
    if (cat.parentCategoryId === null) {
      topLevel.push(cat);
    } else {
      const siblings = childrenByParentId.get(cat.parentCategoryId);
      if (siblings) siblings.push(cat);
      else childrenByParentId.set(cat.parentCategoryId, [cat]);
    }
  }

  return { topLevel, childrenByParentId };
}

/** A sub-category's displayed colour always follows its parent's *current* colour,
 * not whatever was last baked into its own `color` column — otherwise editing the
 * parent's colour leaves every child showing its stale, previously-saved value. */
export function resolveCategoryColor(cat: Category, categories: Category[]): string | null {
  if (cat.parentCategoryId == null) return cat.color;
  const parent = categories.find((c) => c.id === cat.parentCategoryId);
  return parent?.color ?? cat.color;
}

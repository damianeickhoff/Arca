import type { Category } from "@/db/schema";

// Two levels (src/lib/category-groups-migration.ts): groups hold categories. Groups
// are only headings and totals; only categories are ever assigned to anything.

export interface CategoryGroupBlock {
  group: Category;
  categories: Category[];
}

/** How a group sorts: spending first, then savings, then income; "Other" last of the
 *  spending groups; alphabetical otherwise. */
function groupRank(group: Category) {
  const kind = group.group === "income" ? 2 : group.group === "savings" ? 1 : 0;
  const other = group.configKey === "Other" ? 1 : 0;
  return [kind, other] as const;
}

export function compareGroups(a: Category, b: Category) {
  const [ka, oa] = groupRank(a);
  const [kb, ob] = groupRank(b);
  return ka - kb || oa - ob || a.name.localeCompare(b.name);
}

/** Every group with its categories (alphabetical), in the order the app lists them.
 *  A category whose group is missing from `categories` is left out. */
export function groupCategories(categories: Category[]): CategoryGroupBlock[] {
  const groups = categories.filter((c) => c.isGroup).sort(compareGroups);
  const byGroup = new Map<number, Category[]>(groups.map((g) => [g.id, []]));
  for (const cat of categories) {
    if (cat.isGroup || cat.parentCategoryId == null) continue;
    byGroup.get(cat.parentCategoryId)?.push(cat);
  }
  return groups.map((group) => ({
    group,
    categories: (byGroup.get(group.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

/** A category's displayed colour always follows its group's *current* colour, not
 *  whatever was last baked into its own `color` column. */
export function resolveCategoryColor(cat: Category, categories: Category[]): string | null {
  if (cat.parentCategoryId == null) return cat.color;
  const parent = categories.find((c) => c.id === cat.parentCategoryId);
  return parent?.color ?? cat.color;
}

import { notFound } from "next/navigation";
import { db } from "@/db";
import { categories, categoryRules, banks } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { CategorySettingsClient } from "@/components/settings/categories/category-settings-client";

// Reached via client-side drill-down from the categories list — force-dynamic so
// edits show up immediately instead of a stale cached RSC payload.
export const dynamic = "force-dynamic";

export default async function CategorySettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isFinite(categoryId)) notFound();

  const [cats, rules, allBanks] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.name)),
    db.select().from(categoryRules).where(eq(categoryRules.categoryId, categoryId)),
    db.select().from(banks).orderBy(asc(banks.displayName)),
  ]);

  const category = cats.find((c) => c.id === categoryId);
  if (!category) notFound();

  return (
    <CategorySettingsClient
      category={category}
      rules={rules}
      banks={allBanks}
      categories={cats}
    />
  );
}

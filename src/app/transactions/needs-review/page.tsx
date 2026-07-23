import { db } from "@/db";
import { categories, goals } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { IconArrowDownLeft } from "@tabler/icons-react";
import { PageShell } from "@/components/page-shell";
import { MobileSubpageHeader } from "@/components/mobile-menu-ui";
import { formatEur } from "@/lib/format";
import { getNeedsReviewTransactions } from "@/lib/needs-review";
import { NeedsReviewList } from "./needs-review-list";

export const dynamic = "force-dynamic";

export default async function NeedsReviewPage() {
  const [rows, cats, savingsGoals] = await Promise.all([
    getNeedsReviewTransactions(),
    db.select().from(categories).orderBy(categories.group, categories.name),
    db.select().from(goals).where(and(eq(goals.goalType, "savings"), eq(goals.active, true))).orderBy(asc(goals.name)),
  ]);

  const total = rows.reduce((sum, r) => sum + (r.correctedAmount ?? r.amount), 0);

  const content = (
    <div className="pb-24 space-y-4">
      <MobileSubpageHeader title="Needs review" backHref="/" />

      <div className="px-4">
        <p className="text-sm text-muted-foreground">
          {rows.length} transaction{rows.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="flex size-6 items-center justify-center rounded-full bg-foreground text-background shrink-0">
            <IconArrowDownLeft className="size-4" />
          </span>
          <span className="text-2xl font-semibold tabular-nums">{formatEur(total)}</span>
        </div>
      </div>

      <div className="px-4">
        {rows.length === 0 ? (
          <div className="rounded-2xl bg-card py-16 text-center text-muted-foreground text-sm">
            Nothing to review — every transaction has a category.
          </div>
        ) : (
          <NeedsReviewList rows={rows} categories={cats} savingsGoals={savingsGoals} />
        )}
      </div>
    </div>
  );

  return (
    <PageShell
      mobile={content}
      desktop={<div className="mx-auto max-w-2xl">{content}</div>}
    />
  );
}

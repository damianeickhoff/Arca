import { db } from "@/db";
import { transactions, reimbursements, categories } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { formatEur, formatDate } from "@/lib/format";
import { LinkDialog } from "./link-dialog";
import { UnlinkButton } from "./unlink-button";
import { EditExpectedButton } from "./edit-expected-button";

async function getVoorschottenData() {
  // 1. Tikkies with remaining balance (unlinked or partially allocated)
  const unlinked = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      description: transactions.description,
      rawDescription: transactions.rawDescription,
      allocatedAmount: sql<number>`COALESCE((SELECT sum(r.amount) FROM reimbursements r WHERE r.reimbursement_transaction_id = ${transactions.id}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.isReimbursement, true),
        sql`COALESCE((SELECT sum(r.amount) FROM reimbursements r WHERE r.reimbursement_transaction_id = ${transactions.id}), 0) < ${transactions.amount} - 0.01`
      )
    )
    .orderBy(sql`${transactions.date} desc`);

  // 2. Expenses with at least one linked reimbursement + their totals
  const linked = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      description: transactions.description,
      categoryName: categories.name,
      categoryColor: categories.color,
      expectedReimbursement: transactions.expectedReimbursement,
      linkedAmount: sql<number>`COALESCE((
        SELECT sum(r2.amount) FROM reimbursements r2
        WHERE r2.original_transaction_id = ${transactions.id}
      ), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      sql`EXISTS (SELECT 1 FROM reimbursements r WHERE r.original_transaction_id = ${transactions.id})`
    )
    .orderBy(sql`${transactions.date} desc`);

  // 3. All reimbursement links (for unlink button)
  const links = await db
    .select({
      id: reimbursements.id,
      reimbursementTransactionId: reimbursements.reimbursementTransactionId,
      originalTransactionId: reimbursements.originalTransactionId,
      amount: reimbursements.amount,
    })
    .from(reimbursements);

  return { unlinked, linked, links };
}

export async function VoorschottenTab() {
  const { unlinked, linked, links } = await getVoorschottenData();

  const open = linked.filter((r) => r.linkedAmount < (r.expectedReimbursement ?? r.amount) - 0.01);
  const closed = linked.filter((r) => r.linkedAmount >= (r.expectedReimbursement ?? r.amount) - 0.01);

  const totalToReceive =
    unlinked.reduce((s, t) => s + t.amount, 0) +
    open.reduce((s, t) => s + ((t.expectedReimbursement ?? t.amount) - t.linkedAmount), 0);

  return (
    <div className="space-y-6 px-5 pb-5 md:px-6 md:pb-6 lg:px-8 lg:pb-8 pt-4">

      {/* Summary */}
      {totalToReceive > 0 && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-5 py-4">
          <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wider mb-0.5">Still to receive</p>
          <p className="text-2xl font-black tabular-nums text-amber-600 dark:text-amber-400">{formatEur(totalToReceive)}</p>
        </div>
      )}
      {totalToReceive === 0 && unlinked.length === 0 && linked.length === 0 && (
        <div className="rounded-2xl bg-card px-5 py-8 text-center text-muted-foreground text-sm">
          No advances found.
        </div>
      )}

      {/* Unlinked Tikkies */}
      {unlinked.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Ongekoppelde Tikkies ({unlinked.length})
          </h2>
          <div className="space-y-2">
            {unlinked.map((t) => {
              const remaining = t.amount - t.allocatedAmount;
              const pct = t.allocatedAmount > 0 ? Math.round((t.allocatedAmount / t.amount) * 100) : 0;
              return (
                <div key={t.id} className="rounded-xl bg-card border border-amber-200 dark:border-amber-800/50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.description}</p>
                      {t.rawDescription && t.rawDescription !== t.description && (
                        <p className="text-xs text-muted-foreground truncate">{t.rawDescription}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(t.date)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums text-green-600">+{formatEur(t.amount)}</p>
                      {t.allocatedAmount > 0 && (
                        <p className="text-[10px] tabular-nums text-muted-foreground">nog {formatEur(remaining)} over</p>
                      )}
                    </div>
                    <LinkDialog tikkie={{ id: t.id, amount: t.amount, description: t.description, date: t.date, allocatedAmount: t.allocatedAmount }} />
                  </div>
                  {t.allocatedAmount > 0 && (
                    <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Open advances */}
      {open.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Openstaande voorschotten ({open.length})
          </h2>
          <div className="space-y-2">
            {open.map((t) => {
              const target = t.expectedReimbursement ?? t.amount;
              const pct = Math.round((t.linkedAmount / target) * 100);
              const remaining = target - t.linkedAmount;
              const expenseLinks = links.filter((l) => l.originalTransactionId === t.id);
              return (
                <div key={t.id} className="rounded-xl bg-card px-4 py-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(t.date)}
                        {t.categoryName && (
                          <> · <span style={{ color: t.categoryColor ?? undefined }}>{t.categoryName}</span></>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums text-red-500">-{formatEur(t.amount)}</p>
                      <p className="text-xs tabular-nums text-muted-foreground flex items-center gap-1">
                        verwacht: {formatEur(target)}
                        <EditExpectedButton transactionId={t.id} current={target} />
                      </p>
                      <p className="text-xs tabular-nums text-green-600">+{formatEur(t.linkedAmount)} gedekt</p>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-2">
                    <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {pct}% gedekt · nog <span className="font-medium text-amber-600">{formatEur(remaining)}</span> open
                    </p>
                    <div className="flex gap-1">
                      {expenseLinks.map((l) => (
                        <UnlinkButton key={l.id} linkId={l.id} />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Closed advances */}
      {closed.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden select-none">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Afgehandeld ({closed.length})
            </h2>
          </summary>
          <div className="space-y-2 mt-3">
            {closed.map((t) => {
              const expenseLinks = links.filter((l) => l.originalTransactionId === t.id);
              return (
                <div key={t.id} className="rounded-xl bg-card px-4 py-3 flex items-center gap-3 opacity-70">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(t.date)}
                      {t.categoryName && (
                        <> · <span style={{ color: t.categoryColor ?? undefined }}>{t.categoryName}</span></>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums text-red-500">-{formatEur(t.amount)}</p>
                    <p className="text-xs text-green-600">✓ fully covered</p>
                  </div>
                  <div className="flex gap-1">
                    {expenseLinks.map((l) => (
                      <UnlinkButton key={l.id} linkId={l.id} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

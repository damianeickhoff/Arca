import { db } from "@/db";
import { debts, debtRecurring, recurringItems } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { EditDebtClient } from "./edit-debt-client";

export const dynamic = "force-dynamic";

export default async function EditDebtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const debtId = Number(id);
  if (!Number.isFinite(debtId)) notFound();

  const [[debt], bills, links] = await Promise.all([
    db.select().from(debts).where(eq(debts.id, debtId)),
    db.select().from(recurringItems).orderBy(asc(recurringItems.name)),
    db.select().from(debtRecurring).where(eq(debtRecurring.debtId, debtId)),
  ]);
  if (!debt) notFound();

  return <EditDebtClient debt={debt} bills={bills} currentRecurringIds={links.map((l) => l.recurringItemId)} />;
}

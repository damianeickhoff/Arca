import { db } from "@/db";
import { recurringItems } from "@/db/schema";
import { asc } from "drizzle-orm";
import { DebtForm } from "../debt-form";

export const dynamic = "force-dynamic";

export default async function AddDebtPage() {
  const bills = await db.select().from(recurringItems).orderBy(asc(recurringItems.name));
  return <DebtForm bills={bills} />;
}

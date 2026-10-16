import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { recurringItems } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { getFinancialMonthConfig } from "@/lib/app-settings";
import { getPlanProgress } from "@/lib/payment-plan-progress";

// How far one payment plan is paid off, for the recurring detail dialog — which opens
// from several places (Settings › Recurring, Forecast, a transaction, a debt) that don't
// load plan progress themselves. Same rule as the Recurring list (getPlanProgress).
export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const itemId = Number(req.nextUrl.searchParams.get("itemId"));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "Missing or invalid itemId" }, { status: 400 });
  }

  const [item] = await db.select().from(recurringItems).where(eq(recurringItems.id, itemId));
  if (!item) return NextResponse.json({ error: "Recurring item not found" }, { status: 404 });

  const progress = await getPlanProgress([item], await getFinancialMonthConfig());
  return NextResponse.json(progress.get(item.id) ?? null);
}

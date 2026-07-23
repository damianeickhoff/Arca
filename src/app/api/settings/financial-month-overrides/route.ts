import { db } from "@/db";
import { financialMonthOverrides } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

function parseStartDay(value: unknown) {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (Number.isInteger(n) && n >= 1 && n <= 28) return n;
  return null;
}

function isValidMonth(value: string | null): value is string {
  return value != null && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const rows = await db.select().from(financialMonthOverrides).orderBy(asc(financialMonthOverrides.month));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { month, startDay } = await req.json();
  const parsedStartDay = parseStartDay(startDay);

  if (!isValidMonth(month) || parsedStartDay == null) {
    return NextResponse.json({ error: "month and startDay are required" }, { status: 400 });
  }

  await db.insert(financialMonthOverrides).values({
    month,
    startDay: parsedStartDay,
  }).onConflictDoUpdate({
    target: financialMonthOverrides.month,
    set: { startDay: parsedStartDay },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const monthParam = new URL(req.url).searchParams.get("month");

  if (!isValidMonth(monthParam)) {
    return NextResponse.json({ error: "valid month required" }, { status: 400 });
  }

  await db.delete(financialMonthOverrides).where(eq(financialMonthOverrides.month, monthParam));
  return NextResponse.json({ ok: true });
}

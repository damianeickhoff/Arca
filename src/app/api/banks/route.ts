import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { banks } from "@/db/schema";
import { normalizeAccountNumber } from "@/lib/internal-transfers";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const rows = await db
    .select()
    .from(banks)
    .orderBy(asc(banks.displayName), asc(banks.accountNumber));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  const providedAccountNumber = normalizeAccountNumber(body.accountNumber);
  const [row] = await db
    .insert(banks)
    .values({
      accountNumber: providedAccountNumber,
      displayName: body.displayName || null,
      icon: body.icon || null,
      color: body.color || null,
      cardType: body.cardType || null,
      expirationDate: body.expirationDate || null,
      startingBalance: body.startingBalance != null ? Number(body.startingBalance) : null,
      startingDate: body.startingDate || null,
      transferKind: body.transferKind || null,
      includeInNetWorth: body.includeInNetWorth ?? false,
    })
    .returning();

  // A manually-added ("custom") account has no CSV account number — but transactions
  // are matched to a bank purely via transactions.account = banks.accountNumber, so
  // without one this account could never be picked for a transaction or have its
  // balance affected by one (see backfillBankAccountNumbers for the same fix applied
  // to any pre-existing custom accounts).
  let result = row;
  if (!providedAccountNumber) {
    [result] = await db
      .update(banks)
      .set({ accountNumber: `CUSTOM-${row.id}` })
      .where(eq(banks.id, row.id))
      .returning();
  }

  // A balance/account change needs to reach every route that reads it (dashboard,
  // net worth, reports) regardless of which route the edit itself happened on —
  // router.refresh() alone only busts the client's cache for the current route.
  revalidatePath("/", "layout");
  return NextResponse.json(result, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  const { id, ...data } = body;
  const [row] = await db
    .update(banks)
    .set({
      accountNumber: data.accountNumber !== undefined ? normalizeAccountNumber(data.accountNumber) : undefined,
      displayName: data.displayName ?? undefined,
      icon: data.icon !== undefined ? (data.icon || null) : undefined,
      color: data.color !== undefined ? (data.color || null) : undefined,
      cardType: data.cardType ?? undefined,
      expirationDate: data.expirationDate ?? undefined,
      startingBalance: data.startingBalance !== undefined ? (data.startingBalance != null ? Number(data.startingBalance) : null) : undefined,
      startingDate: data.startingDate !== undefined ? data.startingDate : undefined,
      transferKind: data.transferKind !== undefined ? (data.transferKind || null) : undefined,
      includeInNetWorth: data.includeInNetWorth !== undefined ? !!data.includeInNetWorth : undefined,
    })
    .where(eq(banks.id, id))
    .returning();
  revalidatePath("/", "layout");
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json();
  await db.delete(banks).where(eq(banks.id, body.id));
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}

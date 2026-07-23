import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getBankBalance } from "@/lib/account-balances";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const balance = await getBankBalance(Number(id));
  if (balance === null) return NextResponse.json({ error: "Bank not found" }, { status: 404 });
  return NextResponse.json({ balance });
}

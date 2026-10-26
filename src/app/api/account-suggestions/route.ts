import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { dismissAccountSuggestion, listAccountSuggestions } from "@/lib/account-suggestions";

// Settings › Accounts › "Found in your transactions": accounts Arca spotted in the
// imported rows (src/lib/account-suggestions.ts). Adding one goes through
// /api/vermogen or /api/banks like any account; this route lists and hides them.

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  return NextResponse.json(await listAccountSuggestions());
}

/** { dismiss: key }: "Not mine", the suggestion stays hidden. */
export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (typeof body?.dismiss !== "string" || !body.dismiss) return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  await dismissAccountSuggestion(body.dismiss);
  return NextResponse.json({ ok: true });
}

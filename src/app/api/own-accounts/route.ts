import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ownAccounts } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { normalizeAccountNumber } from "@/lib/internal-transfers";
import { dismissOwnAccountSuggestion, listOwnAccountSuggestions } from "@/lib/own-account-suggestions";

// Own accounts that are not imported (Settings › Accounts › Own accounts): money to or
// from one is an internal transfer on every screen (src/lib/internal-transfers.ts).

const KINDS = new Set(["savings", "investments", "shared_account", "other"]);

type Fields = { name: string; accountNumber: string | null; matchText: string | null; transferKind: string };

/** The fields of a body, or an error: a name, and an account number or a match text. */
function parseFields(body: Record<string, unknown>): Fields | { error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const accountNumber = typeof body.accountNumber === "string" ? normalizeAccountNumber(body.accountNumber) : null;
  const matchText = typeof body.matchText === "string" ? body.matchText.trim() || null : null;
  const transferKind = typeof body.transferKind === "string" && KINDS.has(body.transferKind) ? body.transferKind : "other";
  if (!name) return { error: "A name is required." };
  // Too short a piece of text would match half the transactions.
  if (!accountNumber && (!matchText || matchText.replace(/\s+/g, "").length < 4)) {
    return { error: "An account number or at least 4 characters to match is required." };
  }
  return { name, accountNumber, matchText, transferKind };
}

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  const [accounts, suggestions] = await Promise.all([
    db.select().from(ownAccounts).orderBy(asc(ownAccounts.name)),
    listOwnAccountSuggestions(),
  ]);
  return NextResponse.json({ accounts, suggestions });
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  // { dismiss: key } hides a suggestion instead of adding an account.
  if (typeof body.dismiss === "string") {
    await dismissOwnAccountSuggestion(body.dismiss);
    return NextResponse.json({ ok: true });
  }
  const fields = parseFields(body);
  if ("error" in fields) return NextResponse.json(fields, { status: 400 });
  const [row] = await db.insert(ownAccounts).values(fields).returning();
  revalidatePath("/", "layout");
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const fields = parseFields(body);
  if ("error" in fields) return NextResponse.json(fields, { status: 400 });
  const [row] = await db.update(ownAccounts).set(fields).where(eq(ownAccounts.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  revalidatePath("/", "layout");
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  await db.delete(ownAccounts).where(eq(ownAccounts.id, id));
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}

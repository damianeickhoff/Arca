import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { merchants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { deleteMerchant, getOrCreateMerchantId, listMerchants } from "@/lib/merchants";
import { normalizeMerchantKey } from "@/lib/merchant-name";

// GET /api/merchants — every merchant with its transaction count (merchant picker).
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  return NextResponse.json(await listMerchants());
}

// POST /api/merchants { name } — get-or-create by normalized name. Returns the merchant.
export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { name } = await req.json();
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  // revive: an explicit user pick outranks an earlier delete.
  const id = await getOrCreateMerchantId(name, true);
  if (id == null) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  const [merchant] = await db.select().from(merchants).where(eq(merchants.id, id));
  return NextResponse.json(merchant, { status: 201 });
}

// PATCH /api/merchants { id, name?, icon?, color? } — rename / restyle a profile.
// A rename also re-keys the profile, so renaming onto an existing merchant's key is
// rejected rather than silently violating the unique index.
export async function PATCH(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id, name, icon, color } = await req.json();
  if (typeof id !== "number") return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const patch: { name?: string; normalizedKey?: string; icon?: string | null; color?: string | null } = {};
  if (typeof name === "string" && name.trim()) {
    const key = normalizeMerchantKey(name);
    if (!key) return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    const [clash] = await db.select({ id: merchants.id }).from(merchants).where(eq(merchants.normalizedKey, key));
    if (clash && clash.id !== id) {
      return NextResponse.json({ error: "A merchant with that name already exists." }, { status: 409 });
    }
    patch.name = name.trim();
    patch.normalizedKey = key;
  }
  if (icon !== undefined) patch.icon = icon;
  if (color !== undefined) patch.color = color;

  const [row] = await db.update(merchants).set(patch).where(eq(merchants.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  return NextResponse.json(row);
}

// DELETE /api/merchants { id } — soft-delete; unlinks the merchant's transactions and
// stops auto-derivation from recreating it.
export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await req.json();
  if (typeof id !== "number") return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const ok = await deleteMerchant(id);
  if (!ok) return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

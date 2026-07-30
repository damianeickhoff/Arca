import { NextRequest, NextResponse } from "next/server";
import { deleteImportProfile, listImportProfiles } from "@/lib/import-profiles";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  return NextResponse.json(await listImportProfiles());
}

/** Forget a saved column mapping. The next import of a file with that header asks for a
 *  mapping again instead of silently reapplying one that turned out to be wrong. */
export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await req.json();
  if (typeof id !== "number") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await deleteImportProfile(id);
  return NextResponse.json({ ok: true });
}

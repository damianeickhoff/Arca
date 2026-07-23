import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const rows = await db.select().from(appSettings);
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (row.value !== null) result[row.key] = row.value;
  }
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { key, value } = await req.json();
  if (!key || value === undefined) return NextResponse.json({ error: "key and value required" }, { status: 400 });
  await db.insert(appSettings).values({ key, value: String(value) }).onConflictDoUpdate({
    target: appSettings.key,
    set: { value: String(value) },
  });
  return NextResponse.json({ ok: true });
}

import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// Settings that must never reach the browser or be written through this generic route:
// the AI keys (Gemini, local server), the Enable Banking credentials and the app-lock
// secrets. They are read and written only by their own server code (src/lib/ai-provider.ts, src/lib/enable-banking,
// src/app/actions/app-lock.ts), which checks what it needs to (the password, a WebAuthn
// assertion) before touching them.
const PRIVATE_PREFIXES = ["ai_gemini_key", "ai_local_api_key", "eb_", "app_lock_", "push_vapid_", "notify_"];

function isPrivateKey(key: string) {
  return PRIVATE_PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix));
}

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const rows = await db.select().from(appSettings);
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (row.value !== null && !isPrivateKey(row.key)) result[row.key] = row.value;
  }
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { key, value } = await req.json();
  if (typeof key !== "string" || !key || value === undefined) {
    return NextResponse.json({ error: "key and value required" }, { status: 400 });
  }
  if (isPrivateKey(key)) return NextResponse.json({ error: "This setting cannot be changed here." }, { status: 403 });
  await db.insert(appSettings).values({ key, value: String(value) }).onConflictDoUpdate({
    target: appSettings.key,
    set: { value: String(value) },
  });
  return NextResponse.json({ ok: true });
}

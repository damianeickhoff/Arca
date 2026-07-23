import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

// Lets the onboarding wizard warn about a duplicate email right on the email step,
// instead of only finding out after filling in a password too (see /api/onboarding,
// which still re-checks server-side at account creation as the real guard). Public —
// reachable before a session exists, see PUBLIC_PATHS.
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ available: false });

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return NextResponse.json({ available: existing.length === 0 });
}

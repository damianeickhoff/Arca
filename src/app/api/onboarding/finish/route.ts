import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, requireAuth } from "@/lib/auth";

// Marks onboarding as actually complete — called only when the wizard's final
// "Finish" step is clicked (see onboarding-wizard.tsx's finish()). The account row
// itself is created much earlier (leaving the password step, see /api/onboarding),
// so /register's "skip onboarding if a user exists" guard needs this separate signal
// to know the wizard was genuinely finished rather than abandoned mid-flow.
export async function POST() {
  const denied = await requireAuth();
  if (denied) return denied;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db.update(users).set({ onboardingComplete: true }).where(eq(users.id, user.id));

  return NextResponse.json({ ok: true });
}

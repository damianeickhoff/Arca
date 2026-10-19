import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { markInviteUsed, signupGateFor } from "@/lib/invites";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Onboarding registration. Deliberately a route handler (not a server action): a server
// action invoked from /register auto-refreshes that route's RSC afterwards, which re-runs
// its `if (user) redirect("/")` guard and would eject the just-logged-in user out of the
// wizard before the bill/import steps. A fetch() call has no such side effect. This route
// is listed in PUBLIC_PATHS (src/proxy.ts) so it's reachable before a session exists.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const firstName = String(body.firstName ?? "").trim();
  const lastName = String(body.lastName ?? "").trim();
  const birthday = String(body.birthday ?? "").trim();
  const password = String(body.password ?? "");
  const inviteToken = String(body.invite ?? "").trim() || null;

  // Same gate as /register: after the first user, only a usable invite (or the
  // ALLOW_OPEN_SIGNUP escape hatch) may create an account. Checked again here because
  // the page check happened when the wizard opened, and a link can expire meanwhile.
  const gate = await signupGateFor(inviteToken);
  if (gate === "closed") return NextResponse.json({ error: "Sign-up is closed. Ask an admin for an invite link." }, { status: 403 });

  if (!firstName) return NextResponse.json({ error: "Enter your first name." }, { status: 400 });
  if (!lastName) return NextResponse.json({ error: "Enter your last name." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) return NextResponse.json({ error: "Dit e-mailadres is al geregistreerd." }, { status: 409 });

  // Determine first-user BEFORE inserting the new row. An account made through the
  // ALLOW_OPEN_SIGNUP escape hatch is an admin too: that flag exists for an owner who
  // lost their only admin account, and nobody else could promote the new one.
  const isFirstUser = gate === "first-user";
  const isAdmin = isFirstUser || gate === "open";

  const passwordHash = await bcrypt.hash(password, 10);
  const name = `${firstName} ${lastName}`.trim();
  const [created] = await db
    .insert(users)
    .values({ email, name, firstName, lastName, birthday: birthday || null, passwordHash, isAdmin, onboardingComplete: false })
    .returning({ id: users.id });

  // Burn the invite the moment the account exists. "invite" is only reported when the
  // invite was what let them in, so an open sign-up never touches a stale token.
  if (gate === "invite" && inviteToken) await markInviteUsed(inviteToken, created.id);

  await createSession(created.id);

  return NextResponse.json({ ok: true, isFirstUser });
}

"use server";

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users, sessions, appSettings, mfaChallenges } from "@/db/schema";
import { createSession, destroySession, getCurrentUser, generateSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { verifyTotpCode, verifyBackupCode } from "@/lib/totp";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MFA_COOKIE = "mfa_pending";
const MFA_CHALLENGE_MINUTES = 5;
const MFA_MAX_ATTEMPTS = 5;

export async function registerAction(formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (!name) return { error: "Enter your name." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) return { error: "Dit e-mailadres is al geregistreerd." };

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({ email, name, passwordHash });

  return {};
}

// Cheap check used by the register page to decide up-front whether the wizard should
// include the (first-user-only) recurring-bill and CSV-import steps. The wizard's actual
// account creation lives in the POST /api/onboarding route handler (not a server action) —
// see that route for why.
export async function isFirstUser(): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length === 0;
}

export async function loginAction(formData: FormData): Promise<{ error?: string; mfaRequired?: boolean }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "") || "/";
  const remember = formData.get("remember") === "on";

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user) return { error: "Onjuist e-mailadres of wachtwoord." };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { error: "Onjuist e-mailadres of wachtwoord." };

  if (!user.totpEnabled) {
    await createSession(user.id, { remember });
    redirect(next);
  }

  // Password is correct but MFA is enabled — hold the login in a short-lived server-side
  // challenge (identified by an httpOnly cookie) until verifyMfaAction confirms a TOTP or
  // backup code. No session exists yet.
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + MFA_CHALLENGE_MINUTES * 60 * 1000);
  await db.insert(mfaChallenges).values({
    id: token,
    userId: user.id,
    rememberMe: remember,
    redirectTo: next,
    expiresAt: expiresAt.toISOString(),
  });

  const store = await cookies();
  store.set(MFA_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: MFA_CHALLENGE_MINUTES * 60,
  });

  return { mfaRequired: true };
}

export async function verifyMfaAction(formData: FormData): Promise<{ error?: string }> {
  const code = String(formData.get("code") ?? "").trim();
  const store = await cookies();
  const token = store.get(MFA_COOKIE)?.value;
  if (!token) return { error: "Sessie verlopen. Log opnieuw in." };

  const challengeRows = await db.select().from(mfaChallenges).where(eq(mfaChallenges.id, token)).limit(1);
  const challenge = challengeRows[0];
  if (!challenge || new Date(challenge.expiresAt).getTime() < Date.now()) {
    await db.delete(mfaChallenges).where(eq(mfaChallenges.id, token));
    store.delete(MFA_COOKIE);
    return { error: "Sessie verlopen. Log opnieuw in." };
  }

  const userRows = await db.select().from(users).where(eq(users.id, challenge.userId)).limit(1);
  const user = userRows[0];
  if (!user || !user.totpEnabled || !user.totpSecret) {
    await db.delete(mfaChallenges).where(eq(mfaChallenges.id, token));
    store.delete(MFA_COOKIE);
    return { error: "Sessie verlopen. Log opnieuw in." };
  }

  let ok = verifyTotpCode(user.totpSecret, code);
  if (!ok) {
    const backup = await verifyBackupCode(code, user.totpBackupCodes);
    if (backup.valid) {
      ok = true;
      await db.update(users).set({ totpBackupCodes: JSON.stringify(backup.remaining) }).where(eq(users.id, user.id));
    }
  }

  if (!ok) {
    const attempts = challenge.attempts + 1;
    if (attempts >= MFA_MAX_ATTEMPTS) {
      await db.delete(mfaChallenges).where(eq(mfaChallenges.id, token));
      store.delete(MFA_COOKIE);
      return { error: "Te veel mislukte pogingen. Log opnieuw in." };
    }
    await db.update(mfaChallenges).set({ attempts }).where(eq(mfaChallenges.id, token));
    return { error: "Onjuiste code." };
  }

  await db.delete(mfaChallenges).where(eq(mfaChallenges.id, token));
  store.delete(MFA_COOKIE);
  await createSession(user.id, { remember: challenge.rememberMe });
  redirect(challenge.redirectTo || "/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function updateOwnProfileAction(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter your name." };

  await db.update(users).set({ name }).where(eq(users.id, user.id));
  return { success: true };
}

export async function updateOwnAuthBackgroundAction(presetId: string): Promise<{ error?: string; success?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };

  await db.update(users).set({ authBackground: presetId }).where(eq(users.id, user.id));
  return { success: true };
}

export async function updateSidebarSubtitleAction(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };

  const subtitle = String(formData.get("subtitle") ?? "").trim();
  if (!subtitle) return { error: "Enter some text." };
  if (subtitle.length > 40) return { error: "Maximaal 40 tekens." };

  await db.insert(appSettings).values({ key: "sidebar_subtitle", value: subtitle })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: subtitle } });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateOwnEmailAction(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const currentPassword = String(formData.get("currentPassword") ?? "");

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "Huidig wachtwoord is onjuist." };

  if (email === user.email) return { success: true };

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) return { error: "Dit e-mailadres is al in gebruik." };

  await db.update(users).set({ email }).where(eq(users.id, user.id));
  return { success: true };
}

export async function updateOwnPasswordAction(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not logged in." };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "Huidig wachtwoord is onjuist." };
  if (newPassword.length < 8) return { error: "New password must be at least 8 characters." };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

  // Invalidate other sessions on password change.
  const store = await cookies();
  const currentToken = store.get(SESSION_COOKIE)?.value;
  const all = await db.select().from(sessions).where(eq(sessions.userId, user.id));
  for (const s of all) {
    if (s.id !== currentToken) {
      await db.delete(sessions).where(eq(sessions.id, s.id));
    }
  }

  return { success: true };
}

import crypto from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invites, users, type Invite } from "@/db/schema";
import { inviteExpiry, isInviteUsable, signupGate, type SignupGate } from "./invite-rules";

// Invite links (Settings › Users): the database side. The rules themselves (expiry,
// single use, the ALLOW_OPEN_SIGNUP escape hatch) are in src/lib/invite-rules.ts.

export type { SignupGate } from "./invite-rules";
export { isOpenSignupAllowed, invitePath } from "./invite-rules";

/** A URL-safe random token; 32 bytes of entropy, like a session id. */
export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function hasAnyUser(): Promise<boolean> {
  return (await db.select({ id: users.id }).from(users).limit(1)).length > 0;
}

export async function findInvite(token: string): Promise<Invite | null> {
  const clean = token.trim();
  if (!clean) return null;
  const [row] = await db.select().from(invites).where(eq(invites.token, clean)).limit(1);
  return row ?? null;
}

/** The gate for a visitor of /register (or a POST to /api/onboarding) carrying `token`. */
export async function signupGateFor(token: string | null | undefined): Promise<SignupGate> {
  const hasUsers = await hasAnyUser();
  const invite = hasUsers && token ? await findInvite(token) : null;
  return signupGate({ hasUsers, invite });
}

export async function createInvite(createdBy: number): Promise<Invite> {
  const [row] = await db
    .insert(invites)
    .values({ token: generateInviteToken(), createdBy, expiresAt: inviteExpiry() })
    .returning();
  return row;
}

/** Pending invites (not used, not expired), newest first: what the Users panel lists. */
export async function listPendingInvites(now: Date = new Date()): Promise<Invite[]> {
  const rows = await db.select().from(invites).where(isNull(invites.usedAt)).orderBy(desc(invites.id));
  return rows.filter((row) => isInviteUsable(row, now));
}

export async function deleteInvite(id: number): Promise<void> {
  await db.delete(invites).where(eq(invites.id, id));
}

/**
 * Burns the invite once the invited person's account exists. Returns false when the
 * token was already used in between (two people opening the same link at once).
 */
export async function markInviteUsed(token: string, userId: number): Promise<boolean> {
  const updated = await db
    .update(invites)
    .set({ usedAt: new Date().toISOString(), usedBy: userId })
    .where(and(eq(invites.token, token), isNull(invites.usedAt)))
    .returning({ id: invites.id });
  return updated.length > 0;
}

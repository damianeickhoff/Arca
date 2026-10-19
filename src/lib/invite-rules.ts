// The rules behind invite links, with no database or Node-only imports so the Users
// panel (a client component) and the tests can share them. The DB side lives in
// src/lib/invites.ts.
//
// Sign-up is closed as soon as the first user exists: after that /register only opens
// for a link carrying a valid invite token, or when ALLOW_OPEN_SIGNUP=true is set on
// the server (the escape hatch for an owner who lost their only admin account — see
// the install guide).

/** How long a fresh invite link stays usable. */
export const INVITE_TTL_DAYS = 7;

export interface InviteLike {
  expiresAt: string;
  usedAt: string | null;
}

/** When an invite created at `now` stops working, as an ISO timestamp. */
export function inviteExpiry(now: Date = new Date(), days = INVITE_TTL_DAYS): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** An invite can be used once, and only until it expires. */
export function isInviteUsable(invite: InviteLike | null | undefined, now: Date = new Date()): boolean {
  if (!invite) return false;
  if (invite.usedAt) return false;
  const expires = new Date(invite.expiresAt).getTime();
  return Number.isFinite(expires) && expires > now.getTime();
}

/** The escape hatch: ALLOW_OPEN_SIGNUP=true reopens /register without an invite. */
export function isOpenSignupAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return (env.ALLOW_OPEN_SIGNUP ?? "").trim().toLowerCase() === "true";
}

export type SignupGate = "first-user" | "invite" | "open" | "closed";

/**
 * Whether someone without a session may create an account, and why. The first install
 * (no users yet) is always open; after that an invite or the environment flag is
 * needed. An invite wins over the flag so a used link is burned even while the flag
 * happens to be set.
 */
export function signupGate({
  hasUsers,
  invite,
  env = process.env,
  now = new Date(),
}: {
  hasUsers: boolean;
  invite?: InviteLike | null;
  env?: Record<string, string | undefined>;
  now?: Date;
}): SignupGate {
  if (!hasUsers) return "first-user";
  if (isInviteUsable(invite, now)) return "invite";
  if (isOpenSignupAllowed(env)) return "open";
  return "closed";
}

/** The relative link an invite's token turns into; the Users panel prefixes the origin. */
export function invitePath(token: string): string {
  return `/register?invite=${encodeURIComponent(token)}`;
}

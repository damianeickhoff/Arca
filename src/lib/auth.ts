import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";

export const SESSION_COOKIE = "session_token";
const SESSION_DAYS = 30;
// Server-side safety cap for a non-"remembered" session: the cookie itself has no maxAge
// (a browser-session cookie, gone on browser close), but if the browser process stays
// alive indefinitely (e.g. a pinned tab) the DB-backed session shouldn't live forever.
const SHORT_SESSION_DAYS = 1;

export function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

// `remember: false` (the "Keep me signed in" checkbox unchecked) sets a real browser-session
// cookie — no maxAge, so it's cleared on browser close — backed by a short server-side
// expiry. `remember: true` (default, matches the app's historical behavior) keeps today's
// 30-day persistent cookie.
export async function createSession(userId: number, opts?: { remember?: boolean }) {
  const remember = opts?.remember ?? true;
  const days = remember ? SESSION_DAYS : SHORT_SESSION_DAYS;

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    id: token,
    userId,
    expiresAt: expiresAt.toISOString(),
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    ...(remember ? { maxAge: SESSION_DAYS * 24 * 60 * 60 } : {}),
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, token));
  }
  store.delete(SESSION_COOKIE);
}

// Guard for API routes. The proxy (src/proxy.ts) only checks that a session cookie is
// present — it can't validate the cookie against the database without pulling a DB
// dependency into the edge-adjacent proxy layer — so route handlers must independently
// verify the session is real (not forged/stale) before touching data.
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

// Drop-in guard for API route handlers: `const denied = await requireAuth(); if (denied) return denied;`
// Returns a 401 JSON response when there's no valid session, otherwise null.
export async function requireAuth(): Promise<NextResponse | null> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, token))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) return null;

  return row.user;
}

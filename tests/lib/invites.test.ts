import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inviteExpiry, invitePath, isInviteUsable, isOpenSignupAllowed, signupGate } from "@/lib/invite-rules";
import { migrateTestDb, removeTestDb } from "../helpers/test-db";

const now = new Date("2026-10-19T12:00:00Z");
const fresh = { expiresAt: inviteExpiry(now), usedAt: null };

describe("invite rules", () => {
  it("a new invite works for seven days", () => {
    expect(inviteExpiry(now)).toBe("2026-10-26T12:00:00.000Z");
    expect(isInviteUsable(fresh, now)).toBe(true);
    expect(isInviteUsable(fresh, new Date("2026-10-26T11:59:59Z"))).toBe(true);
    expect(isInviteUsable(fresh, new Date("2026-10-26T12:00:00Z"))).toBe(false);
  });

  it("a used, missing or malformed invite never works", () => {
    expect(isInviteUsable({ ...fresh, usedAt: "2026-10-20T08:00:00Z" }, now)).toBe(false);
    expect(isInviteUsable(null, now)).toBe(false);
    expect(isInviteUsable({ expiresAt: "not a date", usedAt: null }, now)).toBe(false);
  });

  it("only the exact value true opens sign-up through the environment", () => {
    expect(isOpenSignupAllowed({ ALLOW_OPEN_SIGNUP: "true" })).toBe(true);
    expect(isOpenSignupAllowed({ ALLOW_OPEN_SIGNUP: " TRUE " })).toBe(true);
    expect(isOpenSignupAllowed({ ALLOW_OPEN_SIGNUP: "1" })).toBe(false);
    expect(isOpenSignupAllowed({ ALLOW_OPEN_SIGNUP: "yes" })).toBe(false);
    expect(isOpenSignupAllowed({})).toBe(false);
  });

  it("the gate: first user always, then invite, then the escape hatch, else closed", () => {
    const env = {};
    expect(signupGate({ hasUsers: false, env, now })).toBe("first-user");
    expect(signupGate({ hasUsers: false, invite: fresh, env, now })).toBe("first-user");
    expect(signupGate({ hasUsers: true, invite: fresh, env, now })).toBe("invite");
    expect(signupGate({ hasUsers: true, invite: { ...fresh, usedAt: "2026-10-20T08:00:00Z" }, env, now })).toBe("closed");
    expect(signupGate({ hasUsers: true, env, now })).toBe("closed");
    expect(signupGate({ hasUsers: true, env: { ALLOW_OPEN_SIGNUP: "true" }, now })).toBe("open");
    // A usable invite is reported as such even with the flag set, so it still gets burned.
    expect(signupGate({ hasUsers: true, invite: fresh, env: { ALLOW_OPEN_SIGNUP: "true" }, now })).toBe("invite");
  });

  it("builds the /register link with the token URL-encoded", () => {
    expect(invitePath("abc")).toBe("/register?invite=abc");
    expect(invitePath("a+b/c=")).toBe("/register?invite=a%2Bb%2Fc%3D");
  });
});

describe("invites in the database", () => {
  let userId: number;

  beforeAll(async () => {
    migrateTestDb();
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const [user] = await db.insert(users).values({ email: "owner@example.test", name: "Owner", passwordHash: "x", isAdmin: true }).returning();
    userId = user.id;
  });
  afterAll(removeTestDb);

  it("creates a random single-use token that opens the gate once", async () => {
    const { createInvite, findInvite, listPendingInvites, markInviteUsed, signupGateFor } = await import("@/lib/invites");

    expect(await signupGateFor(null)).toBe("closed");
    expect(await signupGateFor("nope")).toBe("closed");

    const a = await createInvite(userId);
    const b = await createInvite(userId);
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(40);
    expect(a.createdBy).toBe(userId);
    expect(isInviteUsable(a)).toBe(true);
    expect((await listPendingInvites()).map((i) => i.id)).toEqual([b.id, a.id]);

    expect(await signupGateFor(a.token)).toBe("invite");
    expect(await markInviteUsed(a.token, userId)).toBe(true);
    expect(await markInviteUsed(a.token, userId)).toBe(false);
    expect((await findInvite(a.token))?.usedBy).toBe(userId);
    expect(await signupGateFor(a.token)).toBe("closed");
    expect((await listPendingInvites()).map((i) => i.id)).toEqual([b.id]);
  });

  it("drops expired invites from the pending list and withdraws on delete", async () => {
    const { createInvite, deleteInvite, listPendingInvites, signupGateFor } = await import("@/lib/invites");
    const { db } = await import("@/db");
    const { invites } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const stale = await createInvite(userId);
    await db.update(invites).set({ expiresAt: "2020-01-01T00:00:00.000Z" }).where(eq(invites.id, stale.id));
    expect((await listPendingInvites()).some((i) => i.id === stale.id)).toBe(false);
    expect(await signupGateFor(stale.token)).toBe("closed");

    const [open] = await listPendingInvites();
    await deleteInvite(open.id);
    expect(await signupGateFor(open.token)).toBe("closed");
  });
});

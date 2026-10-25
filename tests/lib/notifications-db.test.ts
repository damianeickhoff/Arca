import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateTestDb, removeTestDb } from "../helpers/test-db";

// The notification job's database side: a subject is written once, a disabled kind is
// never written, importDone rewrites today's notice, and the page's reads and marks.

let userId = 0;
let otherId = 0;

beforeAll(async () => {
  migrateTestDb();
  const { db } = await import("@/db");
  const { users } = await import("@/db/schema");
  const [a] = await db.insert(users).values({ email: "a@example.test", name: "A", passwordHash: "x", isAdmin: true }).returning();
  const [b] = await db.insert(users).values({ email: "b@example.test", name: "B", passwordHash: "x" }).returning();
  userId = a.id;
  otherId = b.id;
});

afterAll(() => removeTestDb());

describe("writing notices", () => {
  it("writes a subject once, for every user, even across days", async () => {
    const { writeDueNotices } = await import("@/lib/notifications");
    const draft = { kind: "billDueSoon" as const, subject: "7:2026-10-18", params: { name: "Rent", amount: 950, date: "2026-10-18", days: 3 }, href: "/transactions/upcoming" };
    const first = await writeDueNotices([draft], "2026-10-15");
    expect(first.map((r) => r.userId).sort()).toEqual([userId, otherId].sort());
    expect(first[0].title).toBe("notifications.kinds.billDueSoon.title");
    expect(await writeDueNotices([draft], "2026-10-15")).toEqual([]);
    expect(await writeDueNotices([{ ...draft, params: { ...draft.params, days: 2 } }], "2026-10-16")).toEqual([]);
  });

  it("skips a kind the user switched off", async () => {
    const { setKindEnabled, getDisabledKinds, writeDueNotices } = await import("@/lib/notifications");
    await setKindEnabled(otherId, "updateAvailable", false);
    expect(await getDisabledKinds(otherId)).toEqual(["updateAvailable"]);
    const written = await writeDueNotices([{ kind: "updateAvailable", subject: "9.9.9", params: { version: "9.9.9" }, href: "/settings?panel=about" }], "2026-10-15");
    expect(written.map((r) => r.userId)).toEqual([userId]);
    await setKindEnabled(otherId, "updateAvailable", true);
    expect(await getDisabledKinds(otherId)).toEqual([]);
  });

  it("rewrites today's import notice when it grew, and unreads it", async () => {
    const { writeNotice, markNotificationRead } = await import("@/lib/notifications");
    const draft = { kind: "importDone" as const, subject: "2026-10-15", params: { count: 3, waiting: 1 }, href: "/transactions/needs-review", replace: true };
    const first = await writeNotice(userId, draft, "2026-10-15");
    expect(first).not.toBeNull();
    await markNotificationRead(userId, first!.id);
    expect(await writeNotice(userId, draft, "2026-10-15")).toBeNull();
    const grown = await writeNotice(userId, { ...draft, params: { count: 5, waiting: 2 } }, "2026-10-15");
    expect(grown?.id).toBe(first!.id);
    expect(grown?.readAt).toBeNull();
    expect(JSON.parse(grown!.params!)).toEqual({ count: 5, waiting: 2 });
  });

  it("refuses a second row for the same user, kind, subject and day at the database", async () => {
    const { db } = await import("@/db");
    const { notifications } = await import("@/db/schema");
    const row = { userId, kind: "bankSyncFailed", subject: "1:2026-10-15", day: "2026-10-15", title: "t", body: "b" };
    await db.insert(notifications).values(row);
    expect(() => db.insert(notifications).values(row).run()).toThrow();
  });
});

describe("reading notices", () => {
  it("lists rendered notices, counts unread and marks them read", async () => {
    const { listNotifications, countUnreadNotifications, markAllNotificationsRead } = await import("@/lib/notifications");
    const { items } = await listNotifications(otherId, "en");
    const bill = items.find((i) => i.kind === "billDueSoon");
    expect(bill?.title).toContain("Rent");
    expect(bill?.read).toBe(false);
    const nl = await listNotifications(otherId, "nl");
    expect(nl.items.find((i) => i.kind === "billDueSoon")?.title).not.toBe(bill?.title);
    expect(await countUnreadNotifications(otherId)).toBe(1);
    await markAllNotificationsRead(otherId);
    expect(await countUnreadNotifications(otherId)).toBe(0);
  });

  it("pages with an offset", async () => {
    const { writeNotice, listNotifications } = await import("@/lib/notifications");
    for (let i = 0; i < 4; i++) {
      await writeNotice(otherId, { kind: "updateAvailable", subject: `2.0.${i}`, params: { version: `2.0.${i}` }, href: "/" }, "2026-10-15");
    }
    const page1 = await listNotifications(otherId, "en", { limit: 3 });
    expect(page1.items).toHaveLength(3);
    expect(page1.hasMore).toBe(true);
    const page2 = await listNotifications(otherId, "en", { limit: 3, offset: 3 });
    expect(page2.hasMore).toBe(false);
    expect(new Set([...page1.items, ...page2.items].map((i) => i.id)).size).toBe(page1.items.length + page2.items.length);
  });
});

describe("clearing notices", () => {
  it("hides the user's notices without letting the job write them again", async () => {
    const { writeDueNotices, writeNotice, clearAllNotifications, listNotifications, countUnreadNotifications } = await import("@/lib/notifications");
    const bill = { kind: "billDueSoon" as const, subject: "8:2026-10-20", params: { name: "Gym", amount: 30, date: "2026-10-20", days: 3 }, href: "/transactions/upcoming" };
    const imported = { kind: "importDone" as const, subject: "2026-10-17", params: { count: 2, waiting: 0 }, href: "/transactions/needs-review", replace: true };
    await writeDueNotices([bill], "2026-10-17");
    await writeNotice(userId, imported, "2026-10-17");
    expect((await listNotifications(userId, "en")).items.length).toBeGreaterThan(0);
    const otherBefore = (await listNotifications(otherId, "en")).items.length;

    await clearAllNotifications(userId);
    expect((await listNotifications(userId, "en")).items).toEqual([]);
    expect(await countUnreadNotifications(userId)).toBe(0);
    // Only this user's notices go.
    expect((await listNotifications(otherId, "en")).items).toHaveLength(otherBefore);

    // The next hourly run finds the same subjects and writes nothing.
    expect(await writeDueNotices([bill], "2026-10-17")).toEqual([]);
    expect(await writeDueNotices([{ ...bill, params: { ...bill.params, days: 2 } }], "2026-10-18")).toEqual([]);
    expect(await writeNotice(userId, imported, "2026-10-17")).toBeNull();
    expect((await listNotifications(userId, "en")).items).toEqual([]);

    // Something new still arrives, and a replaced notice that grew comes back.
    await writeNotice(userId, { kind: "updateAvailable", subject: "3.0.0", params: { version: "3.0.0" }, href: "/" }, "2026-10-17");
    const grown = await writeNotice(userId, { ...imported, params: { count: 4, waiting: 1 } }, "2026-10-17");
    expect(grown?.clearedAt).toBeNull();
    const after = await listNotifications(userId, "en");
    expect(after.items.map((i) => i.kind).sort()).toEqual(["importDone", "updateAvailable"]);
    expect(await countUnreadNotifications(userId)).toBe(2);
  });
});

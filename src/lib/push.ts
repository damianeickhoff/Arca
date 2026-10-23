import webpush from "web-push";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, pushSubscriptions } from "@/db/schema";
import { defaultLocale, locales, type Locale } from "@/i18n/config";

// Web Push (Settings › Notifications › Push to this device). Opt-in per user and per
// device: a device only gets pushes after its browser asked for permission and handed
// over a subscription. The VAPID key pair is made once, on first use, and kept in
// app_settings; only the public key ever reaches a browser. The text of a push goes
// through the browser's push service (Apple, Google, Mozilla), encrypted end to end
// with the device's keys, so the service cannot read it.

const KEY_PUBLIC = "push_vapid_public";
const KEY_PRIVATE = "push_vapid_private";
const KEY_SUBJECT = "push_vapid_subject";
// The contact the push services (Apple, Google, Mozilla) see on every push. The project's
// page, never a user's email: About promises nothing of theirs goes along.
const VAPID_SUBJECT = "https://github.com/damianeickhoff/Arca";
/** How long a push service may hold a push for an offline device. */
const PUSH_TTL_SECONDS = 24 * 60 * 60;
const PUSH_TIMEOUT_MS = 10_000;

export interface PushPayload {
  title: string;
  body: string;
  href: string;
  /** The notification id; the service worker uses it as the tag, so a replaced notice collapses. */
  id: number | string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

async function readSetting(key: string): Promise<string | null> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row?.value ?? null;
}

/** The server's VAPID keys, made and stored on the first call. */
export async function getVapidKeys(): Promise<VapidKeys> {
  const [publicKey, privateKey, subject] = await Promise.all([readSetting(KEY_PUBLIC), readSetting(KEY_PRIVATE), readSetting(KEY_SUBJECT)]);
  if (publicKey && privateKey) return { publicKey, privateKey, subject: subject || VAPID_SUBJECT };

  const keys = webpush.generateVAPIDKeys();
  // Two first calls at once: the first pair written wins, both callers read it back.
  await db.insert(appSettings).values([
    { key: KEY_PUBLIC, value: keys.publicKey },
    { key: KEY_PRIVATE, value: keys.privateKey },
    { key: KEY_SUBJECT, value: VAPID_SUBJECT },
  ]).onConflictDoNothing();
  const [storedPublic, storedPrivate, storedSubject] = await Promise.all([readSetting(KEY_PUBLIC), readSetting(KEY_PRIVATE), readSetting(KEY_SUBJECT)]);
  return { publicKey: storedPublic ?? keys.publicKey, privateKey: storedPrivate ?? keys.privateKey, subject: storedSubject ?? VAPID_SUBJECT };
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export interface PushDeviceView {
  id: number;
  label: string | null;
  /** So the panel can tell which row is the device it runs on. */
  endpoint: string;
  createdAt: string;
  lastUsedAt: string | null;
  failedAt: string | null;
}

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** A browser PushSubscription's JSON, checked: an https endpoint and both keys. */
export function parseSubscription(value: unknown): SubscriptionInput | null {
  if (!value || typeof value !== "object") return null;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || endpoint.length > 2048 || !endpoint.startsWith("https://")) return null;
  if (typeof keys?.p256dh !== "string" || typeof keys.auth !== "string" || keys.p256dh.length > 256 || keys.auth.length > 256) return null;
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

function asLocale(value: string | null | undefined): Locale {
  return locales.includes(value as Locale) ? (value as Locale) : defaultLocale;
}

/** Stores this device for the user; a device that subscribed before (also as someone
 *  else on a shared tablet) moves to the current user. */
export async function saveSubscription(userId: number, sub: SubscriptionInput, label: string | null, locale: string | null) {
  const values = { userId, endpoint: sub.endpoint, keys: JSON.stringify(sub.keys), label, locale: asLocale(locale), failedAt: null };
  await db.insert(pushSubscriptions).values(values).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
}

export async function deleteSubscription(userId: number, by: { endpoint?: string; id?: number }) {
  if (by.id != null) {
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.id, by.id)));
  } else if (by.endpoint) {
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, by.endpoint)));
  }
}

export async function listPushDevices(userId: number): Promise<PushDeviceView[]> {
  const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).orderBy(asc(pushSubscriptions.id));
  return rows.map((r) => ({ id: r.id, label: r.label, endpoint: r.endpoint, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt, failedAt: r.failedAt }));
}

export async function countPushDevices(userId: number): Promise<number> {
  return (await listPushDevices(userId)).length;
}

// ─── Sending ─────────────────────────────────────────────────────────────────

/**
 * Sends one push to every device of the user. `payload` may be a function of the
 * device's language, so each device reads it in its own. A subscription the push service
 * says is gone (404/410) is deleted; any other failure marks it `failedAt`. Never throws;
 * callers that must not wait call it with `void`.
 */
export async function sendPush(userId: number, payload: PushPayload | ((locale: Locale) => PushPayload)): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  try {
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    if (subs.length === 0) return { sent, failed };
    const vapid = await getVapidKeys();
    await Promise.all(
      subs.map(async (sub) => {
        const body = typeof payload === "function" ? payload(asLocale(sub.locale)) : payload;
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: JSON.parse(sub.keys) as { p256dh: string; auth: string } },
            JSON.stringify(body),
            { TTL: PUSH_TTL_SECONDS, timeout: PUSH_TIMEOUT_MS, vapidDetails: vapid },
          );
          sent++;
          await db.update(pushSubscriptions).set({ lastUsedAt: new Date().toISOString(), failedAt: null }).where(eq(pushSubscriptions.id, sub.id));
        } catch (e) {
          failed++;
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
          } else {
            console.warn("[push] could not reach a device:", status ?? e);
            await db.update(pushSubscriptions).set({ failedAt: new Date().toISOString() }).where(eq(pushSubscriptions.id, sub.id));
          }
        }
      }),
    );
  } catch (e) {
    console.warn("[push] send failed:", e);
  }
  return { sent, failed };
}

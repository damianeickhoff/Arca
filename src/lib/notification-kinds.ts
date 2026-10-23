// The notification kinds, shared by the server (rules, job, push) and the client (the
// /notifications page, Settings › Notifications). Pure: no database access, so client
// components may import it.
//
// Each kind has a per-user switch (on by default) in Settings › Notifications, and its
// copy at `notifications.kinds.<kind>.title` / `.body` in messages/*.json.

export const NOTIFICATION_KINDS = [
  "billDueSoon",
  "billOverdue",
  "forecastShortfall",
  "paydayCheckIn",
  "bankConsentExpiring",
  "bankSyncFailed",
  "importDone",
  "updateAvailable",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

/** The pastel tone of a kind's icon tile on /notifications; ember only where something
 *  needs attention now (a bill past its date, money running short, a failed sync). */
export const NOTIFICATION_TONE: Record<NotificationKind, "ember" | "peach" | "mint" | "sky" | "lilac" | "butter" | "stone"> = {
  billDueSoon: "butter",
  billOverdue: "ember",
  forecastShortfall: "ember",
  paydayCheckIn: "mint",
  bankConsentExpiring: "peach",
  bankSyncFailed: "ember",
  importDone: "sky",
  updateAvailable: "lilac",
};

/** The translation keys a notice of this kind stores (title, body). */
export function notificationKeys(kind: NotificationKind) {
  return { title: `notifications.kinds.${kind}.title`, body: `notifications.kinds.${kind}.body` };
}

/** The kinds switched off, from the stored JSON array; unknown values are dropped. */
export function parseDisabledKinds(value: string | null | undefined): NotificationKind[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? [...new Set(parsed.filter(isNotificationKind))] : [];
  } catch {
    return [];
  }
}

/** One notice as the /notifications page shows it, already rendered in the reader's language. */
export interface NotificationView {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string | null;
  /** ISO timestamp. */
  createdAt: string;
  read: boolean;
}

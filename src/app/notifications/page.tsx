import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { countUnreadNotifications, listNotifications } from "@/lib/notifications";
import { NotificationsView } from "./notifications-view";

export const dynamic = "force-dynamic";

/**
 * Notifications: what Arca noticed for you (bills due, a forecast running low, new
 * transactions…), newest first. Made by the hourly job in src/lib/notifications.ts and
 * rendered here in your language. Desktop reaches it from the sidebar, phones from the
 * bell in Home's header.
 */
export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const locale = await getLocale();
  const [page, unread] = await Promise.all([listNotifications(user.id, locale), countUnreadNotifications(user.id)]);
  return <NotificationsView items={page.items} hasMore={page.hasMore} unreadCount={unread} now={new Date().toISOString()} />;
}

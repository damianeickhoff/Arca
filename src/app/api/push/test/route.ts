import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sendPush } from "@/lib/push";
import { renderNotice } from "@/lib/notification-text";

/** "Send a test" (Settings › Notifications): one push to each of this user's devices,
 *  in each device's language. Answers how many got it. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await sendPush(user.id, (locale) => {
    const text = renderNotice({ title: "notifications.test.title", body: "notifications.test.body", params: null }, locale);
    return { ...text, href: "/notifications", id: `test-${Date.now()}` };
  });
  return NextResponse.json(result);
}

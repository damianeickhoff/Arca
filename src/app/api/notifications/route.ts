import { NextRequest, NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { listNotifications } from "@/lib/notifications";

/** "Older" on /notifications: the next page of this user's notices, rendered in the
 *  current language. `?offset=` counts the notices already shown. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);
  const page = await listNotifications(user.id, await getLocale(), { offset: Number.isInteger(offset) && offset > 0 ? offset : 0 });
  return NextResponse.json(page);
}

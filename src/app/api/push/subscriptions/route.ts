import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteSubscription, parseSubscription, saveSubscription } from "@/lib/push";
import { deviceLabel } from "@/lib/push-device-label";

// This user's push devices (Settings › Notifications). POST stores the browser's
// subscription for the signed-in user, labelled from its user agent and written in the
// current language; DELETE removes one, by its endpoint (this device) or its id (the list).

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { subscription?: unknown } | null;
  const sub = parseSubscription(body?.subscription);
  if (!sub) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await saveSubscription(user.id, sub, deviceLabel(req.headers.get("user-agent")), await getLocale());
  // About's "Push notifications" tile shows whether this user has a device.
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown; id?: unknown } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : undefined;
  const id = typeof body?.id === "number" && Number.isInteger(body.id) ? body.id : undefined;
  if (!endpoint && id == null) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await deleteSubscription(user.id, { endpoint, id });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}

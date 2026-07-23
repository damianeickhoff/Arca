import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

// Self-fetching source for AuthBackgroundPicker (see src/components/settings/auth-background-picker.tsx)
// — that component is mounted in several places without a shared server-fetched user
// prop, so it reads its own current value here rather than threading one more prop
// through every call site. Saving goes through updateOwnAuthBackgroundAction instead
// (a server action, not this route) since it needs no file/multipart handling.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not logged in." }, { status: 401 });

  return NextResponse.json({ authBackground: user.authBackground });
}

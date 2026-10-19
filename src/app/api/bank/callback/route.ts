import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { completeBankAuth } from "@/lib/bank-sync";

/**
 * Where the bank sends the browser back after consent (whitelisted on the Enable
 * Banking app as <origin>/api/bank/callback — see docs/enable-banking-setup.md).
 * Exchanges the code for a session and opens Settings › Import, where the account
 * mapping dialog takes over (?bank=<connection id>) or the error is explained
 * (?bankError=<code>). Redirects to the origin the consent was started from.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const fallback = req.nextUrl.origin;

  // A top-level navigation from the bank carries the (SameSite=Lax) session cookie.
  if (!(await getCurrentUser())) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/settings?panel=import")}`, fallback));
  }

  const outcome = await completeBankAuth({
    state: params.get("state"),
    code: params.get("code"),
    error: params.get("error"),
  });
  const origin = outcome.origin ?? fallback;
  if (!outcome.ok) {
    return NextResponse.redirect(new URL(`/settings?panel=import&bankError=${encodeURIComponent(outcome.error)}`, origin));
  }
  revalidatePath("/", "layout");
  return NextResponse.redirect(new URL(`/settings?panel=import&bank=${outcome.connectionId}`, origin));
}

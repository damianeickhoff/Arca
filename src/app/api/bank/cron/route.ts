import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { syncBankConnections } from "@/lib/bank-sync";

/**
 * Sync every bank connection, for an external scheduler (cron, Unraid User Scripts):
 *   curl -X POST -H "Authorization: Bearer $BANK_SYNC_TOKEN" https://<centje>/api/bank/cron
 * Public in the proxy (no session cookie), so it only works when the BANK_SYNC_TOKEN
 * environment variable is set and the request carries it. The built-in daily sync
 * (src/lib/bank-scheduler.ts) needs none of this; it is for installs that want their own
 * schedule. See docs/enable-banking-setup.md.
 */
export async function POST(req: NextRequest) {
  const token = process.env.BANK_SYNC_TOKEN?.trim();
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "");
  if (!token || given.length !== Buffer.byteLength(token) || !timingSafeEqual(given, Buffer.from(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const outcome = await syncBankConnections();
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 409 });
  if (outcome.results.some((r) => r.summary.imported > 0)) revalidatePath("/", "layout");
  return NextResponse.json({ results: outcome.results });
}

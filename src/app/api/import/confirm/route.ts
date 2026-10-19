import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { importParsedRows } from "@/lib/import-rows";
import { recordImport } from "@/lib/activity-log";
import { mappingRequest, resolveImport } from "@/lib/import-preview";
import { peekRawImport } from "@/lib/import-raw-cache";
import { requireAuth } from "@/lib/auth";

/**
 * The Import page's second step: import a file ./preview has checked, by its rawId.
 * The file is recognised again rather than trusting anything from the client, so a
 * profile changed in between still applies. Errors are `{ error: code }`.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { rawId?: unknown } | null;
  const text = typeof body?.rawId === "string" ? peekRawImport(body.rawId) : null;
  if (!text) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  let resolved;
  try {
    resolved = await resolveImport(text);
  } catch (e) {
    return NextResponse.json({ error: "parseFailed", detail: String(e) }, { status: 422 });
  }

  if (resolved.kind === "needsMapping") {
    const request = mappingRequest(text, resolved.prefill);
    if (!request) return NextResponse.json({ error: "emptyFile" }, { status: 422 });
    return NextResponse.json(request);
  }

  const { insertedIds, ...result } = await importParsedRows(resolved.rows);
  await recordImport("csvImport", insertedIds, { skipped: result.skipped });
  // New rows move the sidebar's account balances (root layout).
  revalidatePath("/", "layout");
  return NextResponse.json(result);
}

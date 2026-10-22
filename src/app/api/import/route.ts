import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { importParsedRows } from "@/lib/import-rows";
import { recordImport } from "@/lib/activity-log";
import { mappingRequest, resolveImport } from "@/lib/import-preview";
import { requireAuth } from "@/lib/auth";

/**
 * One-shot import: recognise the file and import it straight away (the register
 * wizard's import step). The Import page checks the file first instead — see
 * ./preview and ./confirm.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const text = await file.text();

  let resolved;
  try {
    resolved = await resolveImport(text);
  } catch (e) {
    return NextResponse.json({ error: "Could not parse CSV: " + String(e) }, { status: 422 });
  }

  // Nothing recognised it (or a saved mapping stopped reading the dates) — ask the
  // client to collect a column mapping.
  if (resolved.kind === "needsMapping") {
    const request = mappingRequest(text, resolved.prefill);
    if (!request) return NextResponse.json({ error: "Empty file" }, { status: 422 });
    return NextResponse.json(request);
  }

  const { insertedIds, ...result } = await importParsedRows(resolved.rows);
  await recordImport(insertedIds, { skipped: result.skipped });
  // New rows move the sidebar's account balances (root layout).
  revalidatePath("/", "layout");
  return NextResponse.json(result);
}

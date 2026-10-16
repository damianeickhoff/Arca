import { NextRequest, NextResponse } from "next/server";
import { buildImportPreview, mappingRequest, resolveImport } from "@/lib/import-preview";
import { findMatchingProfile } from "@/lib/import-profiles";
import { requireAuth } from "@/lib/auth";

/**
 * The Import page's first step: read the uploaded file and say what importing it would
 * do — nothing is written. Answers with an ImportPreview (then POST ./confirm with its
 * rawId), a column-mapping request for a file nothing recognises, or `{ error: code }`.
 *
 * `map=1` skips recognition and always asks for a mapping ("Map columns" for a bank
 * that is recognised wrongly or not at all), prefilled with a saved profile's mapping
 * when one matches the file.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "noFile" }, { status: 400 });
  }

  const text = await file.text();

  if (formData.get("map") === "1") {
    const profile = await findMatchingProfile(text);
    const request = mappingRequest(text, profile?.mapping);
    if (!request) return NextResponse.json({ error: "emptyFile" }, { status: 422 });
    return NextResponse.json(request);
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

  if (resolved.rows.length === 0) {
    return NextResponse.json({ error: "noRows" }, { status: 422 });
  }

  return NextResponse.json(await buildImportPreview(text, resolved.rows, resolved.source));
}

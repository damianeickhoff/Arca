import { NextRequest, NextResponse } from "next/server";
import { importParsedRows } from "@/lib/import-rows";
import { parseWithMapping, saveProfile, type ColumnMapping } from "@/lib/import-profiles";
import { takeRawImport } from "@/lib/import-raw-cache";
import { requireAuth } from "@/lib/auth";

interface ManualImportBody {
  rawId: string;
  label: string;
  mapping: ColumnMapping;
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = (await req.json()) as ManualImportBody;
  const { rawId, label, mapping } = body;

  const text = takeRawImport(rawId);
  if (!text) {
    return NextResponse.json({ error: "Upload expired — please re-upload the file" }, { status: 410 });
  }

  let rows;
  try {
    rows = parseWithMapping(text, mapping);
  } catch (e) {
    return NextResponse.json({ error: "Could not parse CSV: " + String(e) }, { status: 422 });
  }

  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const headerLine = withoutBom.split(/\r?\n/)[0] ?? "";
  await saveProfile(label || "Custom bank", headerLine, mapping.delimiter, mapping);

  const result = await importParsedRows(rows);
  return NextResponse.json(result);
}

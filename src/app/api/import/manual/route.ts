import { NextRequest, NextResponse } from "next/server";
import { importParsedRows } from "@/lib/import-rows";
import { parseWithMapping, saveProfile, type ColumnMapping } from "@/lib/import-profiles";
import { peekRawImport } from "@/lib/import-raw-cache";
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

  const text = peekRawImport(rawId);
  if (!text) {
    return NextResponse.json({ error: "Upload expired — please re-upload the file" }, { status: 410 });
  }

  let parsed;
  try {
    parsed = parseWithMapping(text, mapping);
  } catch (e) {
    return NextResponse.json({ error: "Could not parse CSV: " + String(e) }, { status: 422 });
  }

  // A single unreadable date means the date column or format is wrong, which is almost
  // always true of every row in the file. Write nothing, and don't remember the mapping —
  // a half-imported file with garbage dates is far worse than a rejected one.
  if (parsed.invalid.length > 0) {
    return NextResponse.json(
      {
        error: "invalidDates",
        invalidCount: parsed.invalid.length,
        total: parsed.invalid.length + parsed.rows.length,
        samples: parsed.invalid.slice(0, 3).map((r) => r.value),
      },
      { status: 422 },
    );
  }

  // Only now is the mapping worth remembering: it produced a clean parse.
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const headerLine = withoutBom.split(/\r?\n/)[0] ?? "";
  await saveProfile(label || "Custom bank", headerLine, mapping.delimiter, mapping);

  const result = await importParsedRows(parsed.rows);
  return NextResponse.json(result);
}

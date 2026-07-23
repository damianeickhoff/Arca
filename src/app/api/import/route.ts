import { NextRequest, NextResponse } from "next/server";
import { detectAndParse } from "@/lib/bank-parsers";
import { cleanLines, guessDelimiter, splitDelimited } from "@/lib/bank-parsers/types";
import { importParsedRows } from "@/lib/import-rows";
import { findMatchingProfile, parseWithMapping } from "@/lib/import-profiles";
import { cacheRawImport } from "@/lib/import-raw-cache";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const text = await file.text();

  // 1. Try every built-in bank parser.
  let parsed;
  try {
    parsed = detectAndParse(text);
  } catch (e) {
    return NextResponse.json({ error: "Could not parse CSV: " + String(e) }, { status: 422 });
  }

  // 2. Fall back to a previously-saved manual mapping for this same header shape.
  if (!parsed) {
    const profile = await findMatchingProfile(text);
    if (profile) {
      try {
        const rows = parseWithMapping(text, profile.mapping);
        const result = await importParsedRows(rows);
        return NextResponse.json(result);
      } catch (e) {
        return NextResponse.json({ error: "Could not parse CSV: " + String(e) }, { status: 422 });
      }
    }
  }

  // 3. Nothing recognised it — ask the client to collect a column mapping.
  if (!parsed) {
    const lines = cleanLines(text).filter((l) => l.trim());
    if (lines.length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 422 });
    }
    const rawId = cacheRawImport(text);
    const delimiter = guessDelimiter(lines[0]);
    const headers = splitDelimited(lines[0], delimiter);
    const previewRows = lines.slice(1, 6).map((l) => splitDelimited(l, delimiter));

    return NextResponse.json({
      needsMapping: true,
      rawId,
      delimiter,
      headers,
      previewRows,
    });
  }

  const result = await importParsedRows(parsed.rows);
  return NextResponse.json(result);
}

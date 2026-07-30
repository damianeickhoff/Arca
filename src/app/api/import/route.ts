import { NextRequest, NextResponse } from "next/server";
import { detectAndParse } from "@/lib/bank-parsers";
import { cleanLines, guessDelimiter, splitDelimited } from "@/lib/bank-parsers/types";
import { importParsedRows } from "@/lib/import-rows";
import { findMatchingProfile, parseWithMapping } from "@/lib/import-profiles";
import type { ColumnMapping } from "@/lib/import-parse";
import { cacheRawImport } from "@/lib/import-raw-cache";
import { requireAuth } from "@/lib/auth";

/** Hand the file back to the client so the user can map its columns. `prefill` seeds the
 *  dialog with a mapping we already have but can't trust (see the saved-profile branch). */
function needsMapping(text: string, prefill?: ColumnMapping) {
  const lines = cleanLines(text).filter((l) => l.trim());
  if (lines.length === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 422 });
  }
  const delimiter = guessDelimiter(lines[0]);
  return NextResponse.json({
    needsMapping: true,
    rawId: cacheRawImport(text),
    delimiter,
    headers: splitDelimited(lines[0], delimiter),
    previewRows: lines.slice(1, 6).map((l) => splitDelimited(l, delimiter)),
    prefill: prefill ?? null,
  });
}

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
      let mapped;
      try {
        mapped = parseWithMapping(text, profile.mapping);
      } catch (e) {
        return NextResponse.json({ error: "Could not parse CSV: " + String(e) }, { status: 422 });
      }
      // The saved mapping no longer produces readable dates for this file — importing it
      // anyway is how bad dates got into the database in the first place. Send the user
      // back to the mapping dialog with the stored mapping prefilled so they can correct
      // it; a successful re-import overwrites the profile.
      if (mapped.invalid.length > 0) {
        return needsMapping(text, profile.mapping);
      }
      const result = await importParsedRows(mapped.rows);
      return NextResponse.json(result);
    }
  }

  // 3. Nothing recognised it — ask the client to collect a column mapping.
  if (!parsed) {
    return needsMapping(text);
  }

  const result = await importParsedRows(parsed.rows);
  return NextResponse.json(result);
}

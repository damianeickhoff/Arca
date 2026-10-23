import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { importParsedRows } from "@/lib/import-rows";
import { recordImport } from "@/lib/activity-log";
import { runNotificationChecks } from "@/lib/notifications";
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
  await saveProfile(label || "Custom bank", parsed.headerLine, mapping.delimiter, mapping);

  const { insertedIds, ...result } = await importParsedRows(parsed.rows);
  await recordImport(insertedIds, { skipped: result.skipped });
  // "N new transactions, M waiting for a category" (Notifications), without waiting for it.
  if (insertedIds.length > 0) void runNotificationChecks();
  // New rows move the sidebar's account balances (root layout).
  revalidatePath("/", "layout");
  return NextResponse.json(result);
}

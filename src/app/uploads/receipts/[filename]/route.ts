import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { requireAuth } from "@/lib/auth";
import { getReceiptsDir, isSafeUploadFilename, migrateLegacyReceipts } from "@/lib/data-dir";

// Serves receipt photos from the persisted data dir (see src/lib/data-dir.ts) at the same
// /uploads/receipts/<file> URL they used when they lived under public/ — so every
// transactions.receipt_url already stored in the database keeps working unchanged.
// Receipts are personal documents, so unlike icons they are only ever cached privately.
const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { filename } = await params;

  // Reject path traversal / nested paths outright — only a bare filename is valid.
  if (!isSafeUploadFilename(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  migrateLegacyReceipts();

  try {
    const buffer = await readFile(path.join(getReceiptsDir(), filename));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

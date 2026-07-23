import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { requireAuth } from "@/lib/auth";
import { getBrandIconsDir, migrateLegacyBrandIcons } from "@/lib/data-dir";

// Serves brand icons from the persisted data dir (see src/lib/data-dir.ts) at the same
// /uploads/icons/<file> URL they used when they lived under public/ — so every key already
// stored in the database (banks.icon, categories.icon, transactions.brand_icon, etc.) keeps
// working unchanged.
const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  webp: "image/webp",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { filename } = await params;

  // Reject path traversal / nested paths outright — only a bare filename is valid.
  if (!/^[a-z0-9._-]+$/i.test(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  migrateLegacyBrandIcons();

  try {
    const buffer = await readFile(path.join(getBrandIconsDir(), filename));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

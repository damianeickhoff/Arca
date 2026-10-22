import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "fs";
import { Readable } from "stream";
import { getCurrentUser } from "@/lib/auth";
import { backupPath } from "@/lib/backups";

// Downloads one backup from <data dir>/backups. Admins only: a backup is the whole
// database, every user's data included. The name must be one of our own file names
// (src/lib/backups.ts), so nothing outside the backups folder can be reached.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name } = await params;
  const file = backupPath(name);
  if (!file) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  let size: number;
  try {
    size = statSync(/*turbopackIgnore: true*/ file).size;
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ file)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

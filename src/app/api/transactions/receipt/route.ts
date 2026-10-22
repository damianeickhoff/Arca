import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { getReceiptsDir, migrateLegacyReceipts, receiptFilenameFromUrl } from "@/lib/data-dir";

// Receipt photos live in the persisted data dir (see src/lib/data-dir.ts) and are served
// behind authentication by src/app/uploads/receipts/[filename]/route.ts at the same
// /uploads/receipts/<file> URL that transactions.receipt_url has always stored.
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
// The extension comes from the validated MIME type, never from the client's filename.
const EXTENSION_FOR_TYPE: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const transactionId = Number(formData.get("transactionId"));

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    return NextResponse.json({ error: "Missing or invalid transactionId" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPG, and WEBP are allowed" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large (max 10 MB)" }, { status: 400 });
  }

  const [existing] = await db.select({ receiptUrl: transactions.receiptUrl }).from(transactions).where(eq(transactions.id, transactionId));
  if (!existing) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  migrateLegacyReceipts();
  const receiptsDir = getReceiptsDir();

  const ext = EXTENSION_FOR_TYPE[file.type] ?? "jpg";
  const filename = `${Date.now()}-${transactionId}.${ext}`;
  const filepath = path.join(receiptsDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(/*turbopackIgnore: true*/ filepath, buffer);

  // Replace: remove the old file once the new one is safely written.
  const oldFilename = receiptFilenameFromUrl(existing.receiptUrl);
  if (oldFilename && oldFilename !== filename) {
    try { await unlink(/*turbopackIgnore: true*/ path.join(receiptsDir, oldFilename)); } catch { /* already gone */ }
  }

  const receiptUrl = `/uploads/receipts/${filename}`;
  await db.update(transactions).set({ receiptUrl }).where(eq(transactions.id, transactionId));

  return NextResponse.json({ receiptUrl }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { transactionId } = await req.json() as { transactionId: number };
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    return NextResponse.json({ error: "Missing or invalid transactionId" }, { status: 400 });
  }

  const [existing] = await db.select({ receiptUrl: transactions.receiptUrl }).from(transactions).where(eq(transactions.id, transactionId));
  if (!existing) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  migrateLegacyReceipts();
  const filename = receiptFilenameFromUrl(existing.receiptUrl);
  if (filename) {
    try { await unlink(/*turbopackIgnore: true*/ path.join(getReceiptsDir(), filename)); } catch { /* already gone */ }
  }

  await db.update(transactions).set({ receiptUrl: null }).where(eq(transactions.id, transactionId));
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "fs/promises";
import path from "path";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "receipts");
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

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

  await mkdir(UPLOAD_DIR, { recursive: true });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const filename = `${Date.now()}-${transactionId}.${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  // Replace: remove the old file once the new one is safely written.
  if (existing.receiptUrl) {
    const oldFilename = existing.receiptUrl.split("/").pop();
    if (oldFilename) {
      try { await unlink(path.join(UPLOAD_DIR, oldFilename)); } catch { /* already gone */ }
    }
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

  if (existing.receiptUrl) {
    const filename = existing.receiptUrl.split("/").pop();
    if (filename) {
      try { await unlink(path.join(UPLOAD_DIR, filename)); } catch { /* already gone */ }
    }
  }

  await db.update(transactions).set({ receiptUrl: null }).where(eq(transactions.id, transactionId));
  return NextResponse.json({ ok: true });
}

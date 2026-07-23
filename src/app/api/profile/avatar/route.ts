import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getAvatarsDir, migrateLegacyAvatars } from "@/lib/data-dir";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPG, and WEBP are allowed" }, { status: 400 });
  }

  migrateLegacyAvatars();

  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_").toLowerCase();
  const filename = `${currentUser.id}-${Date.now()}-${safeName}`;
  const filepath = path.join(getAvatarsDir(), filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  const url = `/uploads/avatars/${filename}`;
  await db.update(users).set({ avatarUrl: url }).where(eq(users.id, currentUser.id));

  revalidatePath("/settings");
  revalidatePath("/", "layout");

  return NextResponse.json({ url }, { status: 201 });
}

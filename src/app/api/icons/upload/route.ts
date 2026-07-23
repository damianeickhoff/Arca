import { NextRequest, NextResponse } from "next/server";
import { writeFile, readdir, unlink } from "fs/promises";
import path from "path";
import { requireAuth } from "@/lib/auth";
import { getBrandIconsDir, migrateLegacyBrandIcons } from "@/lib/data-dir";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  migrateLegacyBrandIcons();

  try {
    const files = await readdir(getBrandIconsDir());
    const icons = files
      .filter((f) => /\.(png|jpg|jpeg|svg|webp)$/i.test(f))
      .map((f) => ({
        key: `img:/uploads/icons/${f}`,
        url: `/uploads/icons/${f}`,
        name: f,
      }));
    return NextResponse.json(icons);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPG, SVG, and WEBP are allowed" }, { status: 400 });
  }

  const safeName  = file.name.replace(/[^a-z0-9._-]/gi, "_").toLowerCase();
  const filename  = `${Date.now()}-${safeName}`;
  const filepath  = path.join(getBrandIconsDir(), filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  return NextResponse.json({ key: `img:/uploads/icons/${filename}`, url: `/uploads/icons/${filename}` }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { key } = await req.json() as { key: string };
  if (!key?.startsWith("img:/uploads/icons/")) {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }
  const filename = key.slice("img:/uploads/icons/".length).split("?")[0];
  const filepath = path.join(getBrandIconsDir(), filename);
  try {
    await unlink(filepath);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

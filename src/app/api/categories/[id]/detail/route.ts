import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getCategoryDetail, type BucketUnit } from "@/lib/category-detail";

const VALID_UNITS: BucketUnit[] = ["day", "week", "month"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const categoryId = parseInt(id);
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const refDays = parseInt(req.nextUrl.searchParams.get("refDays") ?? "30") || 30;
  const unitParam = req.nextUrl.searchParams.get("unit");
  const avgUnit: BucketUnit = VALID_UNITS.includes(unitParam as BucketUnit) ? (unitParam as BucketUnit) : "week";
  const direction: "income" | "expense" = req.nextUrl.searchParams.get("direction") === "income" ? "income" : "expense";
  if (!from || !to || Number.isNaN(categoryId)) {
    return NextResponse.json({ error: "Missing from/to" }, { status: 400 });
  }

  const detail = await getCategoryDetail(categoryId, from, to, refDays, avgUnit, direction);
  if (!detail) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  return NextResponse.json(detail);
}

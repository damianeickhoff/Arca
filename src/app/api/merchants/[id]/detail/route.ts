import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getMerchantDetail } from "@/lib/merchant-detail";

// GET /api/merchants/:id/detail?from=&to= — all-time by default; from/to narrow it.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const merchantId = parseInt(id, 10);
  if (Number.isNaN(merchantId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const detail = await getMerchantDetail(
    merchantId,
    req.nextUrl.searchParams.get("from"),
    req.nextUrl.searchParams.get("to"),
  );
  if (!detail) return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  return NextResponse.json(detail);
}

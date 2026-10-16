import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getCategorySuggestions } from "@/lib/category-suggestions";

/**
 * POST { ids: number[] } — suggested categories and rule info for the category picker.
 * A POST (it reads nothing it changes) because a bulk selection can be thousands of ids,
 * too long for a query string.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const raw: unknown[] = Array.isArray(body?.ids) ? body.ids : [];
  const ids = raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return NextResponse.json(await getCategorySuggestions([...new Set(ids)]));
}

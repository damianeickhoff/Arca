import { NextResponse } from "next/server";
import { applyAllBrandRules } from "@/lib/apply-brand-rules";
import { requireAuth } from "@/lib/auth";

export async function POST() {
  const denied = await requireAuth();
  if (denied) return denied;

  const updated = await applyAllBrandRules();
  return NextResponse.json({ updated });
}

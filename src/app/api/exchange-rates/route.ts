import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// Free, keyless ECB-backed rates (https://frankfurter.dev) — updated once per weekday.
const SOURCE_URL = "https://api.frankfurter.dev/v1/latest?base=EUR";
const CACHE_MS = 60 * 60 * 1000; // 1 hour — rates don't change more often than that anyway.

let cached: { base: string; rates: Record<string, number>; updatedAt: string } | null = null;
let cachedAt = 0;

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  if (cached && Date.now() - cachedAt < CACHE_MS) {
    return NextResponse.json(cached);
  }

  try {
    const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Upstream returned ${res.status}`);
    const data = await res.json();
    cached = {
      base: data.base ?? "EUR",
      rates: { ...(data.rates ?? {}), [data.base ?? "EUR"]: 1 },
      updatedAt: new Date().toISOString(),
    };
    cachedAt = Date.now();
    return NextResponse.json(cached);
  } catch (error) {
    // Serve a stale cache rather than nothing if the upstream is briefly unreachable.
    if (cached) return NextResponse.json(cached);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch exchange rates." },
      { status: 502 },
    );
  }
}

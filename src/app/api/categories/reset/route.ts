import { NextResponse } from "next/server";
import type { Database } from "better-sqlite3";
import { db } from "@/db";
import { resetDefaultCategories } from "@/lib/config-sync";
import { requireAuth } from "@/lib/auth";

// Destructive: drops every category (including user-created ones) and re-seeds
// src/config/categories.ts. Transactions themselves are kept — see
// resetDefaultCategories() for exactly what gets unlinked.
export async function POST() {
  const denied = await requireAuth();
  if (denied) return denied;

  // config-sync works on the raw better-sqlite3 handle (synchronous, shares the same
  // seeding path as boot), so reach through drizzle for the underlying connection.
  const sqlite = (db as unknown as { $client: Database }).$client;
  resetDefaultCategories(sqlite);

  return NextResponse.json({ ok: true });
}

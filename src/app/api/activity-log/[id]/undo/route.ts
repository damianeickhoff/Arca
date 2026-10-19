import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { undoActivity } from "@/lib/activity-log";

const STATUS = { notFound: 404, notReversible: 400, alreadyUndone: 409, conflict: 409, failed: 500 } as const;

// POST /api/activity-log/:id/undo — reverses one change-log entry (Settings › Data
// health › Recent changes). Errors are `{ error: reason }`; a conflict also names the
// later change that has to be undone first: `{ error: "conflict", conflict: { kind, params } }`.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const entryId = parseInt(id, 10);
  if (Number.isNaN(entryId)) return NextResponse.json({ error: "notFound" }, { status: 404 });

  const result = await undoActivity(entryId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, ...(result.reason === "conflict" ? { conflict: result.conflict } : {}) },
      { status: STATUS[result.reason] },
    );
  }
  // Restored or removed rows move balances and lists everywhere.
  revalidatePath("/", "layout");
  return NextResponse.json(result);
}

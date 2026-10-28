"use server";

import type Database from "better-sqlite3";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { applyGuideChange, isGuideChange, parseGuideState, type GuideChange } from "@/lib/guide";

// Tips and page tours, stored on the account (users.guide_state). The browser applies
// each change to its own copy at once (lib/guide-context.tsx) and sends the same change
// here; nothing on the page depends on the answer, so no revalidation either.

function client(): Database.Database {
  return (db as unknown as { $client: Database.Database }).$client;
}

export async function updateGuideAction(change: GuideChange): Promise<{ error?: "denied" | "invalid" }> {
  const user = await getCurrentUser();
  if (!user) return { error: "denied" };
  if (!isGuideChange(change)) return { error: "invalid" };
  const c = client();
  // Read, change and write in one transaction, so two tabs marking different tips seen
  // at the same moment both land.
  c.transaction(() => {
    const row = c.prepare(`SELECT guide_state FROM users WHERE id = ?`).get(user.id) as { guide_state: string | null } | undefined;
    if (!row) return;
    const next = applyGuideChange(parseGuideState(row.guide_state), change);
    c.prepare(`UPDATE users SET guide_state = ? WHERE id = ?`).run(JSON.stringify(next), user.id);
  })();
  return {};
}

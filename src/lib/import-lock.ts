// Whether an import is writing transactions right now, for this server process. The
// bank sync (manual or the daily one) checks it so it never runs on top of a CSV import
// — both dedupe against what is already stored, and two passes at once would each miss
// the other's rows. Kept on globalThis so dev-mode module reloads share one counter.

const state = globalThis as typeof globalThis & { __centjeImportsRunning?: number };

export function isImportRunning(): boolean {
  return (state.__centjeImportsRunning ?? 0) > 0;
}

/** Runs `fn` with the import marked as running. */
export async function withImportLock<T>(fn: () => Promise<T>): Promise<T> {
  state.__centjeImportsRunning = (state.__centjeImportsRunning ?? 0) + 1;
  try {
    return await fn();
  } finally {
    state.__centjeImportsRunning = Math.max(0, (state.__centjeImportsRunning ?? 1) - 1);
  }
}

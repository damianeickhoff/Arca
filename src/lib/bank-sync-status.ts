// The one-line bank sync status the shell shows under Import (desktop sidebar) and the
// Import page shows under its title on phones. Pure, so client code can import the type.

export type BankSyncStatus =
  /** At least one consent has run out: reconnect it on the Import page. */
  | { state: "expired" }
  /** Connected, but no sync has finished yet. */
  | { state: "never" }
  /** `at` is the newest finished sync (ISO timestamp). */
  | { state: "synced"; at: string };

/** Null without any bank connection — the line only shows once a bank is connected. */
export function summarizeBankSync(
  connections: { status: string; validUntil: string; lastSyncedAt: string | null }[],
  now = Date.now(),
): BankSyncStatus | null {
  if (connections.length === 0) return null;
  if (connections.some((c) => c.status === "expired" || new Date(c.validUntil).getTime() <= now)) return { state: "expired" };
  const latest = connections
    .map((c) => c.lastSyncedAt)
    .filter((at): at is string => !!at)
    .sort()
    .at(-1);
  return latest ? { state: "synced", at: latest } : { state: "never" };
}

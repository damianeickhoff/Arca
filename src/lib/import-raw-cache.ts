import crypto from "crypto";

// Holds an uploaded-but-unrecognized CSV's raw text between the initial upload (which
// returns a column-mapping request) and the follow-up /api/import/manual call, so the
// user doesn't have to re-upload the file after mapping columns. Single-user, self-hosted
// app — an in-memory Map with a short TTL is enough; no need for a DB table or Redis.
const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { text: string; expiresAt: number }>();

function evictExpired() {
  const now = Date.now();
  for (const [id, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(id);
  }
}

export function cacheRawImport(text: string): string {
  evictExpired();
  const id = crypto.randomUUID();
  cache.set(id, { text, expiresAt: Date.now() + TTL_MS });
  return id;
}

/**
 * Read the cached upload **without consuming it**. Deliberately non-destructive: a manual
 * import can be rejected (e.g. the chosen date column doesn't parse) and the user then
 * retries with a corrected mapping against the same rawId. Deleting on read would force a
 * re-upload on every failed attempt.
 */
export function peekRawImport(rawId: string): string | null {
  evictExpired();
  const entry = cache.get(rawId);
  if (!entry) return null;
  return entry.text;
}

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { APP_VERSION } from "@/lib/app-version";
import { RELEASES_URL } from "@/lib/links";

/**
 * The opt-in update check. Off by default: Arca makes no request anywhere unless the
 * owner turns this on in Settings › About. When on, the server asks GitHub's public
 * releases API once a day for the newest tag (one GET, no account, no identifier beyond
 * a User-Agent naming the version) and remembers the answer in app_settings. About
 * shows it next to the version; Home shows a one-time card per newer version.
 */
const KEY_ENABLED = "update_check_enabled";
const KEY_LATEST = "update_check_latest"; // JSON LatestRelease
const KEY_CHECKED_AT = "update_check_at"; // ISO of the last attempt, success or not

const LATEST_RELEASE_API = "https://api.github.com/repos/damianeickhoff/Arca/releases/latest";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LatestRelease {
  version: string;
  url: string;
  checkedAt: string;
}

export interface UpdateCheckState {
  enabled: boolean;
  /** The newest release seen, when a check succeeded since the switch went on. */
  latest: LatestRelease | null;
  /** ISO of the last attempt, success or failure, for "last checked". */
  checkedAt: string | null;
  /** True when `latest` is newer than the running version. */
  available: boolean;
  current: string;
}

/** "1.6.1" → [1, 6, 1]; a "v" prefix and a pre-release suffix are tolerated. */
export function parseVersion(text: string): number[] | null {
  const m = text.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `candidate` is a higher semver than `current`. Unparseable input is never newer. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

async function readSetting(key: string): Promise<string | null> {
  const row = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row[0]?.value ?? null;
}

async function writeSetting(key: string, value: string | null) {
  if (value == null) {
    await db.delete(appSettings).where(eq(appSettings.key, key));
    return;
  }
  await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

function parseLatest(text: string | null): LatestRelease | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Partial<LatestRelease>;
    if (typeof parsed.version !== "string" || typeof parsed.url !== "string" || typeof parsed.checkedAt !== "string") return null;
    return { version: parsed.version, url: parsed.url, checkedAt: parsed.checkedAt };
  } catch {
    return null;
  }
}

export async function getUpdateCheckState(current = APP_VERSION): Promise<UpdateCheckState> {
  const [enabled, latestText, checkedAt] = await Promise.all([readSetting(KEY_ENABLED), readSetting(KEY_LATEST), readSetting(KEY_CHECKED_AT)]);
  const latest = parseLatest(latestText);
  return {
    enabled: enabled === "1",
    latest,
    checkedAt,
    available: latest ? isNewerVersion(latest.version, current) : false,
    current,
  };
}

/** Turning the check off also forgets what it found, so nothing stale lingers. */
export async function setUpdateCheckEnabled(enabled: boolean) {
  await writeSetting(KEY_ENABLED, enabled ? "1" : "0");
  if (!enabled) {
    await writeSetting(KEY_LATEST, null);
    await writeSetting(KEY_CHECKED_AT, null);
  }
}

export type UpdateCheckResult = { ok: true; state: UpdateCheckState } | { ok: false; error: "unavailable" | "unexpected"; state: UpdateCheckState };

/** One request to the releases API, the answer stored. Never throws. */
export async function checkForUpdate(opts: { current?: string; now?: Date; fetchImpl?: typeof fetch } = {}): Promise<UpdateCheckResult> {
  const current = opts.current ?? APP_VERSION;
  const now = opts.now ?? new Date();
  const fetchImpl = opts.fetchImpl ?? fetch;
  await writeSetting(KEY_CHECKED_AT, now.toISOString());
  try {
    const res = await fetchImpl(LATEST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": `Arca/${current}` },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: "unavailable", state: await getUpdateCheckState(current) };
    const body = (await res.json()) as { tag_name?: unknown; html_url?: unknown };
    const version = typeof body.tag_name === "string" ? body.tag_name.replace(/^v/, "") : null;
    if (!version || !parseVersion(version)) return { ok: false, error: "unexpected", state: await getUpdateCheckState(current) };
    const url = typeof body.html_url === "string" && body.html_url.startsWith("https://github.com/") ? body.html_url : `${RELEASES_URL}/tag/v${version}`;
    const latest: LatestRelease = { version, url, checkedAt: now.toISOString() };
    await writeSetting(KEY_LATEST, JSON.stringify(latest));
    return { ok: true, state: await getUpdateCheckState(current) };
  } catch {
    return { ok: false, error: "unavailable", state: await getUpdateCheckState(current) };
  }
}

/** The daily check, from the root layout: only when the switch is on and the last
 *  attempt is older than a day. Best effort; never surfaces to the page. */
export async function maybeCheckForUpdate(opts: { now?: Date; fetchImpl?: typeof fetch } = {}) {
  try {
    const now = opts.now ?? new Date();
    const [enabled, checkedAt] = await Promise.all([readSetting(KEY_ENABLED), readSetting(KEY_CHECKED_AT)]);
    if (enabled !== "1") return;
    if (checkedAt && now.getTime() - new Date(checkedAt).getTime() < DAY_MS) return;
    await checkForUpdate({ now, fetchImpl: opts.fetchImpl });
  } catch {
    // never let the check break a render
  }
}

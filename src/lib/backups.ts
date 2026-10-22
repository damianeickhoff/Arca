import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { getDataDir } from "@/lib/data-dir";
import { APP_VERSION } from "@/lib/app-version";

/**
 * Database backups in <data dir>/backups. Two kinds:
 *   • "update": made by the server before its first start on a new version
 *     (backupOnVersionChange, called from src/instrumentation.ts); the newest
 *     KEEP_UPDATE_BACKUPS are kept.
 *   • "manual": made from Settings › Data health; never pruned, the user deletes them.
 * A backup is a consistent copy written by SQLite's online backup API, so it is safe
 * while the app runs. Restoring is by hand: stop the container, put the file in place
 * as finance.db (see the guide), start again.
 */
export type BackupReason = "update" | "manual";

export interface BackupInfo {
  /** The file name, e.g. finance-2026-10-22-1045-v1.6.0-update.db */
  name: string;
  reason: BackupReason;
  version: string;
  /** ISO timestamp (local time, minute precision) the file name encodes. */
  createdAt: string;
  /** Bytes. */
  size: number;
}

export const KEEP_UPDATE_BACKUPS = 5;

const VERSION_MARKER = ".arca-version";
const NAME = /^finance-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})-v(\d+\.\d+\.\d+)-(update|manual)(?:-\d+)?\.db$/;

function getDbPath(): string {
  return process.env.DB_PATH || path.join(/*turbopackIgnore: true*/ process.cwd(), "finance.db");
}

export function getBackupsDir(): string {
  const dir = path.join(getDataDir(), "backups");
  fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  return dir;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function backupFilename(now: Date, version: string, reason: BackupReason): string {
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `finance-${stamp}-v${version}-${reason}.db`;
}

export function parseBackupName(name: string, size = 0): BackupInfo | null {
  const m = name.match(NAME);
  if (!m) return null;
  return {
    name,
    reason: m[7] as BackupReason,
    version: m[6],
    createdAt: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00`,
    size,
  };
}

/** Every backup, newest first. */
export function listBackups(): BackupInfo[] {
  const dir = getBackupsDir();
  const out: BackupInfo[] = [];
  for (const name of fs.readdirSync(/*turbopackIgnore: true*/ dir)) {
    const info = parseBackupName(name);
    if (!info) continue;
    try {
      out.push({ ...info, size: fs.statSync(/*turbopackIgnore: true*/ path.join(dir, name)).size });
    } catch {
      // vanished between readdir and stat
    }
  }
  return out.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

/** The absolute path of a backup, or null when the name is not one of ours. */
export function backupPath(name: string): string | null {
  if (!parseBackupName(name)) return null;
  return path.join(getBackupsDir(), name);
}

export function deleteBackup(name: string): boolean {
  const file = backupPath(name);
  if (!file) return false;
  try {
    fs.unlinkSync(/*turbopackIgnore: true*/ file);
    return true;
  } catch {
    return false;
  }
}

/** Writes a consistent copy of the database. Update backups beyond the newest
 *  KEEP_UPDATE_BACKUPS are removed afterwards; manual ones are never touched. */
export async function createBackup(
  reason: BackupReason,
  opts: { version?: string; now?: Date } = {},
): Promise<BackupInfo> {
  const version = opts.version ?? APP_VERSION;
  const now = opts.now ?? new Date();
  const base = backupFilename(now, version, reason);
  const dir = getBackupsDir();
  // Two backups within the same minute: add a counter rather than overwrite.
  let name = base;
  let dest = path.join(dir, name);
  for (let i = 2; fs.existsSync(/*turbopackIgnore: true*/ dest); i++) {
    name = base.replace(/\.db$/, `-${i}.db`);
    dest = path.join(dir, name);
  }

  const source = new Database(/*turbopackIgnore: true*/ getDbPath(), { fileMustExist: true });
  try {
    await source.backup(dest);
  } finally {
    source.close();
  }

  if (reason === "update") pruneUpdateBackups();
  return { ...parseBackupName(name)!, size: fs.statSync(/*turbopackIgnore: true*/ dest).size };
}

function pruneUpdateBackups() {
  const updates = listBackups().filter((b) => b.reason === "update");
  for (const old of updates.slice(KEEP_UPDATE_BACKUPS)) deleteBackup(old.name);
}

/**
 * Before the first start on a new version: back up the database as it was, then
 * remember the version in <data dir>/.arca-version. A fresh install (no database yet)
 * only writes the marker. Returns what happened, for the start-up log.
 */
export async function backupOnVersionChange(version = APP_VERSION): Promise<"created" | "same-version" | "no-database"> {
  const marker = path.join(getDataDir(), VERSION_MARKER);
  const dbExists = fs.existsSync(/*turbopackIgnore: true*/ getDbPath());
  let previous: string | null = null;
  try {
    previous = fs.readFileSync(/*turbopackIgnore: true*/ marker, "utf8").trim();
  } catch {
    previous = null;
  }

  if (!dbExists) {
    fs.mkdirSync(/*turbopackIgnore: true*/ getDataDir(), { recursive: true });
    fs.writeFileSync(/*turbopackIgnore: true*/ marker, version);
    return "no-database";
  }
  if (previous === version) return "same-version";

  // The copy is of the database as the previous version left it, so it carries that
  // version's number. Before the marker existed, the number is unknown: use the new one.
  await createBackup("update", { version: previous ?? version });
  fs.writeFileSync(/*turbopackIgnore: true*/ marker, version);
  return "created";
}

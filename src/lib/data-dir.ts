import fs from "fs";
import path from "path";

// Same DB_PATH resolution as src/db/index.ts / src/db/migrate.ts — the data dir is
// always "wherever finance.db lives" (e.g. /data in Docker, repo root in local dev),
// so brand icons persist across rebuilds without a new env var to configure.
function getDbPath(): string {
  return process.env.DB_PATH || path.join(process.cwd(), "finance.db");
}

export function getDataDir(): string {
  return path.dirname(getDbPath());
}

export function getBrandIconsDir(): string {
  const dir = path.join(getDataDir(), "brand-icons");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getAvatarsDir(): string {
  const dir = path.join(getDataDir(), "avatars");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// One-time migration: brand icons used to live under public/uploads/icons, which is
// baked into the Docker image at build time and lost on every rebuild. Move anything
// still sitting there into the persisted brand-icons dir. Safe to call on every boot —
// it's a no-op once the legacy folder is empty or missing.
let migrated = false;
export function migrateLegacyBrandIcons() {
  if (migrated) return;
  migrated = true;
  migrateLegacyDir(path.join(process.cwd(), "public", "uploads", "icons"), getBrandIconsDir());
}

// Same problem, same fix, for profile photos: src/app/api/profile/avatar/route.ts used to
// write into public/uploads/avatars, which is baked into the Docker image at build time and
// lost on every rebuild.
let avatarsMigrated = false;
export function migrateLegacyAvatars() {
  if (avatarsMigrated) return;
  avatarsMigrated = true;
  migrateLegacyDir(path.join(process.cwd(), "public", "uploads", "avatars"), getAvatarsDir());
}

function migrateLegacyDir(legacyDir: string, targetDir: string) {
  let files: string[];
  try {
    files = fs.readdirSync(legacyDir);
  } catch {
    return; // legacy folder doesn't exist — nothing to migrate
  }

  for (const file of files) {
    const from = path.join(legacyDir, file);
    const to = path.join(targetDir, file);
    if (fs.existsSync(to)) continue;
    try {
      fs.renameSync(from, to);
    } catch {
      // Cross-device rename (e.g. legacy dir and data dir on different volumes) — copy instead.
      fs.copyFileSync(from, to);
      fs.unlinkSync(from);
    }
  }
}

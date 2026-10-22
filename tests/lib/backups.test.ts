import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateTestDb, removeTestDb } from "../helpers/test-db";
import {
  KEEP_UPDATE_BACKUPS,
  backupFilename,
  backupOnVersionChange,
  backupPath,
  createBackup,
  deleteBackup,
  getBackupsDir,
  listBackups,
  parseBackupName,
} from "@/lib/backups";

describe("backups", () => {
  // The test database lives in the OS temp dir, so <temp>/backups and the version marker
  // survive between runs and test files: start from nothing and leave nothing behind.
  const marker = path.join(path.dirname(process.env.DB_PATH!), ".arca-version");
  const wipe = () => {
    fs.rmSync(getBackupsDir(), { recursive: true, force: true });
    fs.rmSync(marker, { force: true });
  };
  beforeAll(() => {
    migrateTestDb();
    wipe();
  });
  afterAll(() => {
    wipe();
    removeTestDb();
  });

  it("names files by minute, version and reason, and parses them back", () => {
    const name = backupFilename(new Date(2026, 9, 22, 10, 45), "1.6.0", "update");
    expect(name).toBe("finance-2026-10-22-1045-v1.6.0-update.db");
    expect(parseBackupName(name)).toEqual({ name, reason: "update", version: "1.6.0", createdAt: "2026-10-22T10:45:00", size: 0 });
    expect(parseBackupName("finance.db")).toBeNull();
    expect(parseBackupName("../finance-2026-10-22-1045-v1.6.0-update.db")).toBeNull();
    expect(backupPath("evil/../x.db")).toBeNull();
  });

  it("writes a readable copy and lists it newest first", async () => {
    const manual = await createBackup("manual", { version: "1.6.0", now: new Date(2026, 9, 22, 9, 0) });
    expect(manual.reason).toBe("manual");
    expect(manual.size).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(getBackupsDir(), manual.name))).toBe(true);

    const later = await createBackup("manual", { version: "1.6.0", now: new Date(2026, 9, 22, 9, 5) });
    expect(listBackups().map((b) => b.name)).toEqual([later.name, manual.name]);
  });

  it("keeps two backups made in the same minute", async () => {
    const now = new Date(2026, 9, 22, 9, 30);
    const a = await createBackup("manual", { version: "1.6.0", now });
    const b = await createBackup("manual", { version: "1.6.0", now });
    expect(b.name).not.toBe(a.name);
    expect(listBackups().filter((x) => x.createdAt === "2026-10-22T09:30:00")).toHaveLength(2);
  });

  it("prunes update backups to the newest few and leaves manual ones alone", async () => {
    for (let i = 0; i < KEEP_UPDATE_BACKUPS + 2; i++) {
      await createBackup("update", { version: `1.${i}.0`, now: new Date(2026, 0, 1 + i, 8, 0) });
    }
    const all = listBackups();
    const updates = all.filter((b) => b.reason === "update");
    expect(updates).toHaveLength(KEEP_UPDATE_BACKUPS);
    expect(updates.map((b) => b.version)).toEqual(["1.6.0", "1.5.0", "1.4.0", "1.3.0", "1.2.0"]);
    expect(all.filter((b) => b.reason === "manual").length).toBeGreaterThanOrEqual(4);
  });

  it("deletes only files it recognises", async () => {
    const b = await createBackup("manual", { version: "1.6.0", now: new Date(2026, 9, 23, 9, 0) });
    expect(deleteBackup(b.name)).toBe(true);
    expect(deleteBackup(b.name)).toBe(false);
    expect(deleteBackup("finance.db")).toBe(false);
  });

  it("backs up once per version change", async () => {
    fs.rmSync(marker, { force: true });

    expect(await backupOnVersionChange("2.0.0")).toBe("created");
    expect(fs.readFileSync(marker, "utf8")).toBe("2.0.0");
    expect(await backupOnVersionChange("2.0.0")).toBe("same-version");
    expect(await backupOnVersionChange("2.1.0")).toBe("created");

    const updates = listBackups().filter((b) => b.reason === "update");
    expect(updates.length).toBe(KEEP_UPDATE_BACKUPS);
    // The backup made on the way to 2.1.0 is the 2.0.0 database.
    expect(updates[0].version).toBe("2.0.0");
  });
});

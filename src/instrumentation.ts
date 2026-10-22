// Runs once when a Next.js server starts. On the Node.js runtime only (both need the
// filesystem / database): backs the database up before the first start on a new
// version (src/lib/backups.ts), moves any uploads still under public/ into the data
// dir (see src/lib/data-dir.ts) and starts the daily bank sync (src/lib/bank-scheduler.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { backupOnVersionChange } = await import("./lib/backups");
    const { APP_VERSION } = await import("./lib/app-version");
    try {
      const result = await backupOnVersionChange();
      if (result === "created") console.log(`Arca ${APP_VERSION}: backed up the database before updating it (see the backups folder next to it).`);
    } catch (err) {
      console.error("Arca: could not back up the database before starting:", err);
    }
    const { migrateLegacyUploads } = await import("./lib/data-dir");
    migrateLegacyUploads();
    const { startBankScheduler } = await import("./lib/bank-scheduler");
    startBankScheduler();
  }
}

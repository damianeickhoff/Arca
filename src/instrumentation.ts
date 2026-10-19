// Runs once when a Next.js server starts. On the Node.js runtime only (both need the
// filesystem / database): moves any uploads still under public/ into the data dir
// (see src/lib/data-dir.ts) and starts the daily bank sync (src/lib/bank-scheduler.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { migrateLegacyUploads } = await import("./lib/data-dir");
    migrateLegacyUploads();
    const { startBankScheduler } = await import("./lib/bank-scheduler");
    startBankScheduler();
  }
}

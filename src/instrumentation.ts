// Runs once when a Next.js server starts. Starts the daily bank sync on the Node.js
// runtime only (it needs the database); see src/lib/bank-scheduler.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBankScheduler } = await import("./lib/bank-scheduler");
    startBankScheduler();
  }
}

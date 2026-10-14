import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // better-sqlite3 is a native module; separate processes keep each test file's
    // temporary database (and the lazy `db` singleton) fully isolated.
    pool: "forks",
    setupFiles: ["tests/setup.ts"],
    // Every date helper in src/lib works in local time — pin it so the suite gives the
    // same answers on any machine.
    env: { TZ: "Europe/Amsterdam" },
  },
});

/**
 * Run this file once to initialise the database.
 * node --experimental-strip-types src/db/migrate.ts
 * (or via the npm script: npm run db:init)
 *
 * The schema itself lives in src/db/create-schema.ts, which the app also runs on its
 * first start against an empty database, so `npm run db:init` is optional.
 */
import Database from "better-sqlite3";
import path from "path";
import { createSchema } from "./create-schema.ts";

const DB_PATH =
  process.env.DB_PATH || path.join(process.cwd(), "finance.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

createSchema(sqlite);

console.log("✅ Database initialised and seeded.");
sqlite.close();

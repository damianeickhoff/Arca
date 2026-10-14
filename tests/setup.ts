import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// src/db/index.ts reads DB_PATH once, when it is first imported, and opens the
// connection lazily on the first query. Point every test file at its own throwaway
// database *before* anything imports it, so no test can ever touch finance.db.
process.env.DB_PATH = path.join(os.tmpdir(), `arca-test-${process.pid}-${crypto.randomUUID()}.db`);

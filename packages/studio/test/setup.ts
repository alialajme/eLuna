import { config } from "dotenv";
import { resolve } from "node:path";

// Reuse the db package's local .env for credentials, then force the connection
// onto `ayvana_test` so tests NEVER touch dev data. Set before any module imports
// the Prisma client singleton.
config({ path: resolve(__dirname, "../../db/.env") });

const url = process.env.DATABASE_URL ?? "";
if (url && !/\/ayvana_test(\?|$)/.test(url)) {
  process.env.DATABASE_URL = url.replace(/\/([^/?]+)(\?|$)/, "/ayvana_test$2");
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:password@localhost:5432/ayvana_test";
}
if (!/[?&]connection_limit=/.test(process.env.DATABASE_URL)) {
  process.env.DATABASE_URL +=
    (process.env.DATABASE_URL.includes("?") ? "&" : "?") + "connection_limit=25&pool_timeout=20";
}

// Keep the storage simulator off disk in CI — the in-memory + data-URI fallback
// is deterministic and leaves no temp files.
process.env.AYVANA_STORAGE_LOCAL_DIR ||= resolve(__dirname, "../.storage-test");
process.env.NODE_ENV = "test";

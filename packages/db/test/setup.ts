import { config } from "dotenv";
import { resolve } from "node:path";

// Load the package's local .env (gitignored) for DB credentials, then force the
// connection onto the dedicated `eluna_test` database so tests NEVER touch dev
// data. Set before any module imports the Prisma client singleton.
config({ path: resolve(__dirname, "../.env") });

const url = process.env.DATABASE_URL ?? "";
if (url && !/\/eluna_test(\?|$)/.test(url)) {
  process.env.DATABASE_URL = url.replace(/\/([^/?]+)(\?|$)/, "/eluna_test$2");
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/eluna_test";
}

// Concurrency tests fire many short interactive transactions at once; widen the
// pool so they cycle instead of hitting pool timeouts.
if (!/[?&]connection_limit=/.test(process.env.DATABASE_URL)) {
  process.env.DATABASE_URL += (process.env.DATABASE_URL.includes("?") ? "&" : "?") + "connection_limit=25&pool_timeout=20";
}

process.env.NODE_ENV = "test";

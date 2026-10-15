import { config } from "dotenv";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Vitest globalSetup — runs ONCE before the studio suite.
 *
 * The studio integration tests share the persistent local `ayvana_test`
 * database with the rest of the monorepo, and several write durable rows
 * (GenerationSession/GenerationJob/CreditTransaction). Without a reset the suite
 * is not re-runnable: residual in-flight jobs from a prior run skew counts (e.g.
 * the per-vendor concurrency cap / billing assertions). CI gets a clean DB for
 * free (fresh Postgres container + `prisma db push`); this reproduces that
 * locally with a single reset before the run. Mirrors packages/db/test/global-setup.ts.
 *
 * Safety: resolves the `ayvana_test` URL and refuses any other database name,
 * so it can never reset the `eluna` dev database. The schema + reset are owned
 * by @ayvana/db, so we run the push from that package's directory.
 */
const DB_PKG = resolve(__dirname, "../../db");

export default function globalSetup() {
  config({ path: resolve(DB_PKG, ".env") });

  let url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/ayvana_test";
  if (!/\/ayvana_test(\?|$)/.test(url)) {
    url = url.replace(/\/([^/?]+)(\?|$)/, "/ayvana_test$2");
  }

  const dbName = url.match(/\/([^/?]+)(\?|$)/)?.[1];
  if (dbName !== "ayvana_test") {
    throw new Error(
      `Refusing to reset test DB: resolved database is "${dbName}", expected "ayvana_test". Aborting to protect dev data.`,
    );
  }

  execFileSync(
    "pnpm",
    ["exec", "prisma", "db", "push", "--force-reset", "--skip-generate"],
    { cwd: DB_PKG, env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" },
  );
}

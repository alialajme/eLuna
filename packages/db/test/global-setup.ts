import { config } from "dotenv";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Vitest globalSetup — runs ONCE before the whole suite.
 *
 * The integration tests share one persistent local Postgres (`ayvana_test`).
 * Several of them write durable rows (OutboxEvent, CreditTransaction, …) that
 * are deliberately append-only, so without a reset the suite is not
 * re-runnable: a second local run trips over residual rows (e.g. the outbox
 * worker draining PENDING events left by a prior run). CI gets a clean DB for
 * free (fresh Postgres service container + `prisma db push` each run); this
 * reproduces that guarantee locally with a single reset before the run.
 *
 * Safety: we resolve the SAME `ayvana_test` URL the test setup uses and refuse
 * to run against anything whose database name is not exactly `ayvana_test`, so
 * this can never reset the `eluna` dev database.
 */
export default function globalSetup() {
  config({ path: resolve(__dirname, "../.env") });

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

  // Force-reset the schema so every local run starts from a clean, known state
  // (mirrors CI's fresh container). `prisma` is a dev dependency of this package.
  execFileSync(
    "pnpm",
    ["exec", "prisma", "db", "push", "--force-reset", "--skip-generate"],
    { cwd: resolve(__dirname, ".."), env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" },
  );
}

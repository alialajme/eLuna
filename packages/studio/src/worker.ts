import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { processOutbox } from "@ayvana/db";
import { logger } from "@ayvana/observability";
import { OUTBOX_GENERATION_ENQUEUED } from "./types";
import { runGenerationJob } from "./pipeline";

// Load the db package's local .env for DATABASE_URL when run directly.
loadEnv({ path: resolve(__dirname, "../../db/.env") });

const log = logger.child({ module: "studio.worker" });

/**
 * The generation worker — the first real consumer of the transactional outbox
 * (ADR-0005). It polls `processOutbox`, which atomically claims due events with
 * `FOR UPDATE SKIP LOCKED` (so parallel workers never double-process), runs the
 * handler, and reschedules with backoff → FAILED after maxAttempts (DLQ).
 *
 * The handler is idempotent (runGenerationJob skips steps whose assets already
 * exist), satisfying the at-least-once contract. No long-held HTTP — the app
 * only enqueues; all generation happens here.
 *
 * MVP: run as `pnpm --filter @ayvana/studio worker` locally or as an AKS
 * Deployment in prod. Scale path (noted in the ADR): promote the outbox to Azure
 * Service Bus + KEDA — a deployment change, not a rewrite.
 */
export async function runWorkerOnce(): Promise<{ processed: number; failed: number; claimed: number }> {
  return processOutbox(
    async (event) => {
      if (event.type !== OUTBOX_GENERATION_ENQUEUED) return; // not ours; leave it
      const payload = (event.payload ?? {}) as { jobId?: string };
      if (!payload.jobId) throw new Error("generation.enqueued missing jobId");
      const result = await runGenerationJob(payload.jobId);
      if (result.status === "failed") {
        // Throw so the outbox reschedules/backs off; the job row already carries
        // the FAILED state + error for observability.
        throw new Error(`generation job failed: ${result.error}`);
      }
      // review_required and completed are terminal successes from the queue's
      // perspective (no retry) — the job row holds the real state.
    },
    { batchSize: 5, maxAttempts: 3, retryBackoffMs: 2000, visibilityTimeoutMs: 120_000 },
  );
}

async function loop(intervalMs: number): Promise<void> {
  log.info("studio worker started", { intervalMs });
  // Graceful shutdown.
  let running = true;
  const stop = () => {
    running = false;
    log.info("studio worker stopping");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (running) {
    try {
      const res = await runWorkerOnce();
      if (res.claimed > 0) log.info("worker pass", res);
    } catch (err) {
      log.error("worker pass error", { error: err instanceof Error ? err.message : String(err) });
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  process.exit(0);
}

// Run the loop only when executed directly (not when imported by a test).
const isDirectRun = (() => {
  try {
    return process.argv[1] ? resolve(process.argv[1]).endsWith("worker.ts") : false;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  const interval = Number(process.env.STUDIO_WORKER_INTERVAL_MS ?? 2000);
  void loop(interval);
}

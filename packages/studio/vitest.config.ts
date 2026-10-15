import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Reset the shared ayvana_test DB once before the suite so local runs are
    // re-runnable (CI already gets a clean container each run). See global-setup.ts.
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    // Integration tests share one Postgres; run files sequentially for
    // deterministic per-test isolation (concurrency is exercised within tests).
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});

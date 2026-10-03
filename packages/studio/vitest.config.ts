import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    // Integration tests share one Postgres; run files sequentially for
    // deterministic per-test isolation (concurrency is exercised within tests).
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});

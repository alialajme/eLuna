import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    // Integration tests share one Postgres; run files sequentially to keep
    // per-test isolation deterministic (concurrency is exercised *within* tests).
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/client.ts", "**/*.d.ts"],
      // Critical financial/inventory modules — held to a high bar.
      thresholds: {
        "src/money.ts": { statements: 95, branches: 90, functions: 95, lines: 95 },
        "src/inventory.ts": { statements: 95, branches: 85, functions: 100, lines: 95 },
        "src/wallet.ts": { statements: 95, branches: 85, functions: 100, lines: 95 },
        "src/order-state.ts": { statements: 95, branches: 90, functions: 100, lines: 95 },
        "src/errors.ts": { statements: 90, branches: 80, functions: 90, lines: 90 },
      },
    },
  },
});

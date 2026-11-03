import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure unit tests (no DB/network): gateway factory + production fail-closed
    // guards. Each test manages its own process.env, so run files sequentially.
    fileParallelism: false,
  },
});
